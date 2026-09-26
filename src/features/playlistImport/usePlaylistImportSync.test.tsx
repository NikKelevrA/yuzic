import React, { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import playlistImportReducer, { connectPlaylistImport, setPlaylistImportServerUrl } from '@/state/redux/slices/playlistImportSlice';
import type { Server } from '@/providers/contracts/Server';
import { usePlaylistImportSync } from './usePlaylistImportSync';
import { __resetToasts, __getToasts } from '@/components/toast/notify';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && Object.keys(opts).length ? `${key}:${JSON.stringify(opts)}` : key;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));

const mockFetchPlaylistStatus = jest.fn();
jest.mock('@/providers/integration/playlistImport', () => ({
  fetchPlaylistStatus: (...args: unknown[]) => mockFetchPlaylistStatus(...args),
}));

let mockTrackDownloaders: unknown[] = [];
jest.mock('@/features/downloaders/registry', () => ({
  useDownloadersForUnit: (unit: string) => (unit === 'track' ? mockTrackDownloaders : []),
}));

const SERVER_ID = 'server-1';

function testServer(): Server {
  return {
    id: SERVER_ID,
    type: 'navidrome',
    serverUrl: 'https://music.example.com',
    username: 'christina',
    isAuthenticated: true,
  };
}

function makeStore({ configured }: { configured: boolean }) {
  const store = configureStore({
    reducer: { servers: serversReducer, playlistImport: playlistImportReducer },
  });
  store.dispatch(addServer(testServer()));
  store.dispatch(setActiveServer(SERVER_ID));
  if (configured) {
    store.dispatch(setPlaylistImportServerUrl({ serverId: SERVER_ID, value: 'http://192.168.1.43:5001' }));
    store.dispatch(connectPlaylistImport({ serverId: SERVER_ID }));
  }
  return store;
}

function wrapper(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return Wrapper;
}

function pendingTrack(overrides: Partial<{ spotifyId: string; title: string; artist: string; retryExpired: boolean }> = {}) {
  return {
    spotifyId: 'track-1',
    position: 0,
    title: 'Song A',
    artist: 'Artist A',
    retryExpired: false,
    ...overrides,
  };
}

const SYNC_INTERVAL_MS = 10 * 60 * 1000;

describe('usePlaylistImportSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetToasts();
    mockFetchPlaylistStatus.mockReset().mockResolvedValue([]);
    mockTrackDownloaders = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never polls when playlist import is not configured', async () => {
    const store = makeStore({ configured: false });
    mockTrackDownloaders = [{ def: { id: 'slskd', downloadTrack: jest.fn() }, config: {} }];

    await act(async () => {
      renderHook(() => usePlaylistImportSync(), { wrapper: wrapper(store) });
    });

    expect(mockFetchPlaylistStatus).not.toHaveBeenCalled();
  });

  it('never polls with no connected track-capable downloader', async () => {
    const store = makeStore({ configured: true });
    mockTrackDownloaders = [];

    await act(async () => {
      renderHook(() => usePlaylistImportSync(), { wrapper: wrapper(store) });
    });

    expect(mockFetchPlaylistStatus).not.toHaveBeenCalled();
  });

  it('sends a pending track to the first connected downloader, immediately on mount', async () => {
    const store = makeStore({ configured: true });
    const downloadTrack = jest.fn().mockResolvedValue({ success: true });
    mockTrackDownloaders = [{ def: { id: 'slskd', downloadTrack }, config: { serverUrl: 'http://slskd', apiKey: 'k' } }];
    mockFetchPlaylistStatus.mockResolvedValue([
      { playlistId: 'playlist-1', navidromePlaylistId: null, name: 'Road Trip', pending: [pendingTrack()] },
    ]);

    await act(async () => {
      renderHook(() => usePlaylistImportSync(), { wrapper: wrapper(store) });
    });

    expect(mockFetchPlaylistStatus).toHaveBeenCalledWith({ serverUrl: 'http://192.168.1.43:5001' }, 'christina');
    expect(downloadTrack).toHaveBeenCalledWith({ serverUrl: 'http://slskd', apiKey: 'k' }, { title: 'Song A', artist: 'Artist A' });
    expect(__getToasts().some(toast => toast.message.includes('autoAcquireStarted'))).toBe(true);
  });

  it('never sends a track past its retry window', async () => {
    const store = makeStore({ configured: true });
    const downloadTrack = jest.fn().mockResolvedValue({ success: true });
    mockTrackDownloaders = [{ def: { id: 'slskd', downloadTrack }, config: {} }];
    mockFetchPlaylistStatus.mockResolvedValue([
      { playlistId: 'playlist-1', navidromePlaylistId: null, name: null, pending: [pendingTrack({ retryExpired: true })] },
    ]);

    await act(async () => {
      renderHook(() => usePlaylistImportSync(), { wrapper: wrapper(store) });
    });

    expect(downloadTrack).not.toHaveBeenCalled();
  });

  it('does not re-send a still-pending track within its cooldown window on the next poll', async () => {
    const store = makeStore({ configured: true });
    const downloadTrack = jest.fn().mockResolvedValue({ success: true });
    mockTrackDownloaders = [{ def: { id: 'slskd', downloadTrack }, config: {} }];
    mockFetchPlaylistStatus.mockResolvedValue([
      { playlistId: 'playlist-1', navidromePlaylistId: null, name: null, pending: [pendingTrack()] },
    ]);

    await act(async () => {
      renderHook(() => usePlaylistImportSync(), { wrapper: wrapper(store) });
    });
    expect(downloadTrack).toHaveBeenCalledTimes(1);

    // The proxy still lists the same track as pending on the next poll (it
    // hasn't resolved yet) — the cooldown should stop a second send.
    await act(async () => {
      jest.advanceTimersByTime(SYNC_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(downloadTrack).toHaveBeenCalledTimes(1);
  });

  it('records the attempt in the store, keyed by playlist and track', async () => {
    const store = makeStore({ configured: true });
    const downloadTrack = jest.fn().mockResolvedValue({ success: true });
    mockTrackDownloaders = [{ def: { id: 'slskd', downloadTrack }, config: {} }];
    mockFetchPlaylistStatus.mockResolvedValue([
      { playlistId: 'playlist-1', navidromePlaylistId: null, name: null, pending: [pendingTrack({ spotifyId: 'track-9' })] },
    ]);

    await act(async () => {
      renderHook(() => usePlaylistImportSync(), { wrapper: wrapper(store) });
    });

    expect(Object.keys(store.getState().playlistImport.byServer[SERVER_ID].attempted)).toEqual(['playlist-1:track-9']);
  });

  it('does not throw when the proxy is unreachable, and tries again next poll', async () => {
    const store = makeStore({ configured: true });
    const downloadTrack = jest.fn().mockResolvedValue({ success: true });
    mockTrackDownloaders = [{ def: { id: 'slskd', downloadTrack }, config: {} }];
    mockFetchPlaylistStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([
      { playlistId: 'playlist-1', navidromePlaylistId: null, name: null, pending: [pendingTrack()] },
    ]);

    await act(async () => {
      renderHook(() => usePlaylistImportSync(), { wrapper: wrapper(store) });
    });
    expect(downloadTrack).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(SYNC_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(downloadTrack).toHaveBeenCalledTimes(1);
  });
});
