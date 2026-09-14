import React, { type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import LidarrView from './Lidarr';
import SlskdView from './Slskd';
import SoulSyncView from './SoulSync';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import downloadersReducer, {
  connectDownloader,
  setDownloaderServerUrl,
} from '@/state/redux/slices/downloadersSlice';
import settingsAppearanceReducer from '@/features/settings/appearance/state';
import { downloaderCredentialScope } from '@/state/redux/selectors/downloadersSelectors';
import { clearCredentialCache, getCredentials, setCredential } from '@/state/credentialCache';
import type { DownloaderId } from '@/state/redux/slices/downloadersSlice';

// Boundaries only: the downloaders' HTTP calls, the toast, and i18n. The
// screens, the connection hook, the real slices, selectors and credential
// cache all run, so a control that stops writing what it claims fails here.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/toast', () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@/providers/integration/slskd', () => ({
  ...jest.requireActual('@/providers/integration/slskd'),
  testConnection: (...args: unknown[]) => mockSlskdTest(...args),
}));

jest.mock('@/providers/integration/lidarr', () => ({
  ...jest.requireActual('@/providers/integration/lidarr'),
  testConnection: (...args: unknown[]) => mockLidarrTest(...args),
  getQualityProfiles: (...args: unknown[]) => mockGetQualityProfiles(...args),
}));

jest.mock('@/providers/integration/soulsync', () => ({
  ...jest.requireActual('@/providers/integration/soulsync'),
  testConnection: (...args: unknown[]) => mockSoulsyncTest(...args),
}));

const mockSlskdTest = jest.fn();
const mockLidarrTest = jest.fn();
const mockSoulsyncTest = jest.fn();
const mockGetQualityProfiles = jest.fn();

import { notify } from '@/components/toast';

const SERVER_ID = 'server-1';

function makeStore({ withServer = true } = {}) {
  const store = configureStore({
    reducer: {
      servers: serversReducer,
      downloaders: downloadersReducer,
      settingsAppearance: settingsAppearanceReducer,
    },
  });
  if (withServer) {
    store.dispatch(addServer({
      id: SERVER_ID,
      type: 'navidrome',
      serverUrl: 'https://music.example',
      username: 'listener',
      isAuthenticated: true,
    }));
    store.dispatch(setActiveServer(SERVER_ID));
  }
  return store;
}

type Store = ReturnType<typeof makeStore>;

async function connected(store: Store, downloader: DownloaderId) {
  store.dispatch(setDownloaderServerUrl({ serverId: SERVER_ID, downloader, value: 'http://downloader' }));
  store.dispatch(connectDownloader({ serverId: SERVER_ID, downloader }));
  await setCredential(downloaderCredentialScope(downloader, SERVER_ID), 'apiKey', 'saved-key');
}

async function renderScreen(store: Store, screen: React.ReactElement) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return render(screen, { wrapper: Wrapper });
}

/** Runs the debounced connection test and lets its promise settle. */
async function afterConnectionPause() {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await act(async () => {});
}

const entry = (store: Store, downloader: DownloaderId) =>
  store.getState().downloaders.byServer[SERVER_ID]?.[downloader];

describe('Downloader settings', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearCredentialCache();
    mockSlskdTest.mockReset().mockResolvedValue({ success: true });
    mockLidarrTest.mockReset().mockResolvedValue({ success: true });
    mockSoulsyncTest.mockReset().mockResolvedValue({ success: true });
    mockGetQualityProfiles.mockReset().mockResolvedValue([
      { id: 1, name: 'Any' },
      { id: 4, name: 'Lossless' },
    ]);
    (notify.error as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing without an active server', async () => {
    const view = await renderScreen(makeStore({ withServer: false }), <SlskdView />);

    expect(view.queryByText('settings.downloaders.slskd.title')).toBeNull();
  });

  it('tests the connection once a URL and key are entered, and keeps the key out of Redux', async () => {
    const store = makeStore();
    const view = await renderScreen(store, <SlskdView />);

    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.serverUrlPlaceholder.slskd'), 'http://slskd');
    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.apiKeyPlaceholder'), 'typed-key');
    expect(mockSlskdTest).not.toHaveBeenCalled();

    await afterConnectionPause();

    expect(mockSlskdTest).toHaveBeenCalledWith({ serverUrl: 'http://slskd', apiKey: 'typed-key' });
    expect(entry(store, 'slskd')).toMatchObject({ serverUrl: 'http://slskd', isAuthenticated: true });
    expect(getCredentials(downloaderCredentialScope('slskd', SERVER_ID)).apiKey).toBe('typed-key');
    expect(JSON.stringify(store.getState())).not.toContain('typed-key');
  });

  it('stays disconnected and says so when the connection test fails', async () => {
    mockSlskdTest.mockRejectedValue(new Error('refused'));
    const store = makeStore();
    const view = await renderScreen(store, <SlskdView />);

    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.serverUrlPlaceholder.slskd'), 'http://slskd');
    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.apiKeyPlaceholder'), 'wrong-key');
    await afterConnectionPause();

    expect(entry(store, 'slskd')?.isAuthenticated).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('settings.downloaders.slskd.connectionFailed');
  });

  it('offers slskd search preferences only once connected, and writes the chosen format', async () => {
    const disconnectedView = await renderScreen(makeStore(), <SlskdView />);
    expect(disconnectedView.queryByText('settings.downloaders.slskd.searchPreferencesTitle')).toBeNull();
    await disconnectedView.unmount();

    const store = makeStore();
    await connected(store, 'slskd');
    const view = await renderScreen(store, <SlskdView />);

    await fireEvent.press(view.getByText('settings.downloaders.slskd.formatFlacOnly'));

    expect(entry(store, 'slskd')?.preferences).toMatchObject({ preferredFormat: 'flac' });
  });

  it('disconnecting clears the connection and the stored key but keeps search preferences', async () => {
    const store = makeStore();
    await connected(store, 'slskd');
    const view = await renderScreen(store, <SlskdView />);
    await fireEvent.press(view.getByText('settings.downloaders.slskd.formatFlacOnly'));

    await fireEvent.press(view.getByText('settings.downloaders.disconnect'));
    await act(async () => {});

    expect(entry(store, 'slskd')).toMatchObject({ serverUrl: '', isAuthenticated: false });
    expect(entry(store, 'slskd')?.preferences).toMatchObject({ preferredFormat: 'flac' });
    expect(getCredentials(downloaderCredentialScope('slskd', SERVER_ID)).apiKey).toBeUndefined();
    expect(view.queryByText('settings.downloaders.disconnect')).toBeNull();
  });

  it('lists Lidarr quality profiles once connected, fetching them once, and saves the chosen default', async () => {
    const store = makeStore();
    await connected(store, 'lidarr');
    const view = await renderScreen(store, <LidarrView />);
    await act(async () => {});

    expect(mockGetQualityProfiles).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByText('Lossless'));

    expect(store.getState().downloaders.defaultsByServer[SERVER_ID]?.lidarrDefaultQualityProfileId).toBe(4);
  });

  it('gives SoulSync the connection card and nothing downloader-specific', async () => {
    const store = makeStore();
    await connected(store, 'soulsync');
    const view = await renderScreen(store, <SoulSyncView />);

    expect(view.getByText('settings.downloaders.soulsync.title')).toBeTruthy();
    expect(view.getByText('settings.downloaders.disconnect')).toBeTruthy();
    expect(view.queryByText('settings.downloaders.slskd.searchPreferencesTitle')).toBeNull();
    expect(view.queryByText('settings.downloaders.lidarr.qualityProfileTitle')).toBeNull();
  });
});
