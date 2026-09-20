import React, { type ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { ALL_DOWNLOADERS, useDownloaderStates } from './registry';
import downloadersReducer from '@/state/redux/slices/downloadersSlice';
import serversReducer from '@/state/redux/slices/serversSlice';
import * as lidarr from '@/providers/integration/lidarr';
import * as slskd from '@/providers/integration/slskd';
import * as soulsync from '@/providers/integration/soulsync';

jest.mock('@/providers/integration/lidarr', () => ({
  ...jest.requireActual('@/providers/integration/lidarr'),
  testConnection: jest.fn(),
}));
jest.mock('@/providers/integration/slskd', () => ({
  ...jest.requireActual('@/providers/integration/slskd'),
  testConnection: jest.fn(),
}));
jest.mock('@/providers/integration/soulsync', () => ({
  ...jest.requireActual('@/providers/integration/soulsync'),
  testConnection: jest.fn(),
}));


/**
 * The identity of this hook's result is load-bearing: DownloadersQueueProvider
 * derives `connectedStates` from it and uses that as a useEffect dependency.
 * A fresh array per render there turned the provider into an infinite render
 * loop ("Maximum update depth exceeded"), so identity is worth pinning down.
 */
function makeStore() {
  return configureStore({
    reducer: { downloaders: downloadersReducer, servers: serversReducer },
  });
}

function wrapper(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return Wrapper;
}

describe('useDownloaderStates', () => {
  it('returns a referentially stable array across re-renders', async () => {
    const store = makeStore();
    const { result, rerender } = await renderHook(() => useDownloaderStates(), {
      wrapper: wrapper(store),
    });

    const first = result.current;
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((s) => typeof s.def.id === 'string')).toBe(true);
    // Nothing configured in a bare store, so nothing is connected.
    expect(first.some((s) => s.isConnected)).toBe(false);

    await rerender({});
    await rerender({});

    expect(result.current).toBe(first);
  });
});

/**
 * `downloadAlbum` used to be required and `downloadTrack` optional, which was
 * Lidarr's shape — album-only, no way to fetch one file — written into the
 * contract for every downloader. SoulSync is the mirror image: its public
 * entry point takes one free-text track request and there is no album
 * endpoint at all. Both units are optional now, and the sheet offers a
 * downloader only for the unit it actually takes.
 */
describe('downloader units', () => {
  const by = (id: string) => ALL_DOWNLOADERS.find(d => d.id === id)!;

  it('lets each downloader declare the units it handles', () => {
    expect(by('lidarr').downloadAlbum).toBeDefined();
    expect(by('lidarr').downloadTrack).toBeUndefined();

    expect(by('slskd').downloadAlbum).toBeDefined();
    expect(by('slskd').downloadTrack).toBeDefined();

    expect(by('soulsync').downloadTrack).toBeDefined();
    expect(by('soulsync').downloadAlbum).toBeUndefined();
  });

  it('gives every downloader at least one unit and a way to read its queue', () => {
    for (const def of ALL_DOWNLOADERS) {
      expect(Boolean(def.downloadAlbum || def.downloadTrack)).toBe(true);
      expect(typeof def.fetchQueue).toBe('function');
      // The success toast is looked up by these keys, so a downloader that
      // handles a unit has to name the string for it.
      if (def.downloadAlbum) expect(def.albumAddedKey).toBeTruthy();
      if (def.downloadTrack) expect(def.trackAddedKey).toBeTruthy();
    }
  });
});

/**
 * Each downloader authenticates the same
 * way (an apiKey tier), wires `testConnection` to its existing per-provider
 * function, and declares an `acquisition.*` slot for exactly the units it
 * implements above. `fetchQueue` stays downloader-operational and is
 * deliberately absent from `slots` — it isn't a product capability.
 */
describe('downloaders as providers', () => {
  const by = (id: string) => ALL_DOWNLOADERS.find(d => d.id === id)!;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('declares an auth tier for every downloader, and names the keys when there are any', () => {
    // This used to assert `apiKey` for all of them, which stopped being true
    // with Downtify: its API has no authentication of any kind, so there is no
    // credential for `configKeys` to name. What holds for all of them is that
    // the tier is declared, and that a downloader claiming a key says which.
    for (const def of ALL_DOWNLOADERS) {
      expect(def.auth.tier).toBeDefined();
      if (def.auth.tier === 'apiKey') {
        expect(def.auth.configKeys).toEqual(expect.arrayContaining(['serverUrl', 'apiKey']));
      }
    }
  });

  it('leaves Downtify with no credential to name', () => {
    const downtify = by('downtify');

    expect(downtify.auth.tier).toBe('none');
    // Not an empty array: there is nothing to configure, which is different
    // from configuring nothing.
    expect(downtify.auth.configKeys).toBeUndefined();
  });

  it('offers Downtify as a track downloader and not an album one', () => {
    // Downtify's album endpoint takes a YouTube Music album URL, which nothing
    // here has. An album Get reaches it through `albumByTracks` instead, the
    // same way it reaches SoulSync.
    const downtify = by('downtify');

    expect(downtify.downloadTrack).toBeDefined();
    expect(downtify.downloadAlbum).toBeUndefined();
    expect(downtify.cancelQueueItem).toBeDefined();
  });

  const config = { serverUrl: 'http://example.test', apiKey: 'key' };

  it('maps lidarr testConnection (boolean) to Health', async () => {
    (lidarr.testConnection as jest.Mock).mockResolvedValue(true);
    await expect(by('lidarr').testConnection(config)).resolves.toEqual({ ok: true });
    expect(lidarr.testConnection).toHaveBeenCalledWith({ serverUrl: config.serverUrl, apiKey: config.apiKey });
  });

  it('maps slskd testConnection (boolean) to Health', async () => {
    (slskd.testConnection as jest.Mock).mockResolvedValue(true);
    await expect(by('slskd').testConnection(config)).resolves.toEqual({ ok: true });
  });

  it('maps soulsync testConnection (boolean) to Health', async () => {
    (soulsync.testConnection as jest.Mock).mockResolvedValue(false);
    await expect(by('soulsync').testConnection(config)).resolves.toEqual({ ok: false });
  });
});
