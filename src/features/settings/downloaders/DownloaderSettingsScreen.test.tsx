import React, { type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import LidarrView from './Lidarr';
import YtFallbackView from './YtFallback';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import downloadersReducer, {
  connectDownloader,
  setDownloaderServerUrl,
} from '@/state/redux/slices/downloadersSlice';
import settingsAppearanceReducer from '@/features/settings/appearance/state';
import { downloaderCredentialScope } from '@/state/redux/selectors/downloadersSelectors';
import { _clearCredentialCache, getCredentials, setCredential } from '@/state/credentialCache';
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

jest.mock('@/providers/integration/ytfallback', () => ({
  ...jest.requireActual('@/providers/integration/ytfallback'),
  testConnection: (...args: unknown[]) => mockYtfallbackTest(...args),
}));

jest.mock('@/providers/integration/lidarr', () => ({
  ...jest.requireActual('@/providers/integration/lidarr'),
  testConnection: (...args: unknown[]) => mockLidarrTest(...args),
  getQualityProfiles: (...args: unknown[]) => mockGetQualityProfiles(...args),
}));

const mockYtfallbackTest = jest.fn();
const mockLidarrTest = jest.fn();
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
    _clearCredentialCache();
    mockYtfallbackTest.mockReset().mockResolvedValue(true);
    mockLidarrTest.mockReset().mockResolvedValue({ success: true });
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
    const view = await renderScreen(makeStore({ withServer: false }), <YtFallbackView />);

    expect(view.queryByText('settings.downloaders.ytfallback.title')).toBeNull();
  });

  it('tests the connection once a URL and key are entered, and keeps the key out of Redux', async () => {
    const store = makeStore();
    const view = await renderScreen(store, <YtFallbackView />);

    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.serverUrlPlaceholder.ytfallback'), 'http://ytfallback');
    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.apiKeyPlaceholder'), 'typed-key');
    expect(mockYtfallbackTest).not.toHaveBeenCalled();

    await afterConnectionPause();

    expect(mockYtfallbackTest).toHaveBeenCalledWith({ serverUrl: 'http://ytfallback', apiKey: 'typed-key' });
    expect(entry(store, 'ytfallback')).toMatchObject({ serverUrl: 'http://ytfallback', isAuthenticated: true });
    expect(getCredentials(downloaderCredentialScope('ytfallback', SERVER_ID)).apiKey).toBe('typed-key');
    expect(JSON.stringify(store.getState())).not.toContain('typed-key');
  });

  // A URL or key pasted from a password manager or a web page routinely carries
  // a trailing newline. Neither is visible in the field: the untrimmed address
  // is unparseable so no request ever leaves the device, and the untrimmed key
  // is sent verbatim and rejected — both reported as a bare "connection failed"
  // against a form that looked correct.
  it('trims whitespace pasted into the URL and key before testing or storing them', async () => {
    const store = makeStore();
    const view = await renderScreen(store, <YtFallbackView />);

    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.serverUrlPlaceholder.ytfallback'), ' http://ytfallback\n');
    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.apiKeyPlaceholder'), 'typed-key\n');
    await afterConnectionPause();

    expect(mockYtfallbackTest).toHaveBeenCalledWith({ serverUrl: 'http://ytfallback', apiKey: 'typed-key' });
    expect(entry(store, 'ytfallback')?.serverUrl).toBe('http://ytfallback');
    expect(getCredentials(downloaderCredentialScope('ytfallback', SERVER_ID)).apiKey).toBe('typed-key');
  });

  it('stays disconnected and says so when the connection test fails', async () => {
    mockYtfallbackTest.mockRejectedValue(new Error('refused'));
    const store = makeStore();
    const view = await renderScreen(store, <YtFallbackView />);

    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.serverUrlPlaceholder.ytfallback'), 'http://ytfallback');
    await fireEvent.changeText(view.getByPlaceholderText('settings.downloaders.apiKeyPlaceholder'), 'wrong-key');
    await afterConnectionPause();

    expect(entry(store, 'ytfallback')?.isAuthenticated).toBe(false);
    // The reason is now carried alongside the label — a 401, a 400 from the
    // wrong scheme and an unparseable address used to be indistinguishable.
    expect(notify.error).toHaveBeenCalledWith('settings.downloaders.ytfallback.connectionFailed: refused');
  });

  it('disconnecting clears the connection and the stored key', async () => {
    const store = makeStore();
    await connected(store, 'ytfallback');
    const view = await renderScreen(store, <YtFallbackView />);

    await fireEvent.press(view.getByText('settings.downloaders.disconnect'));
    await act(async () => {});

    expect(entry(store, 'ytfallback')).toMatchObject({ serverUrl: '', isAuthenticated: false });
    expect(getCredentials(downloaderCredentialScope('ytfallback', SERVER_ID)).apiKey).toBeUndefined();
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

  it('gives YT Fallback the connection card and nothing downloader-specific', async () => {
    const store = makeStore();
    await connected(store, 'ytfallback');
    const view = await renderScreen(store, <YtFallbackView />);

    expect(view.getByText('settings.downloaders.ytfallback.title')).toBeTruthy();
    expect(view.getByText('settings.downloaders.disconnect')).toBeTruthy();
    expect(view.queryByText('settings.downloaders.lidarr.qualityProfileTitle')).toBeNull();
  });
});
