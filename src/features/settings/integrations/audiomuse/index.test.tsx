import React, { type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import AudiomuseView from './';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import audiomuseReducer, {
  connectAudiomuse,
  setAudiomuseServerUrl,
} from '@/state/redux/slices/audiomuseSlice';
import settingsAppearanceReducer from '@/features/settings/appearance/state';
import { audiomuseCredentialScope } from '@/state/redux/selectors/audiomuseSelectors';
import { _clearCredentialCache, getCredentials, setCredential } from '@/state/credentialCache';

// Boundaries only: AudioMuse-AI's HTTP call, the toast and i18n.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/toast', () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@/providers/integration/audiomuse', () => ({
  ...jest.requireActual('@/providers/integration/audiomuse'),
  testConnection: (...args: unknown[]) => mockTestConnection(...args),
}));

const mockTestConnection = jest.fn();

import { notify } from '@/components/toast';

const SERVER_ID = 'server-1';

function makeStore() {
  const store = configureStore({
    reducer: {
      servers: serversReducer,
      audiomuse: audiomuseReducer,
      settingsAppearance: settingsAppearanceReducer,
    },
  });
  store.dispatch(addServer({
    id: SERVER_ID,
    type: 'jellyfin',
    serverUrl: 'https://music.example',
    username: 'listener',
    isAuthenticated: true,
  }));
  store.dispatch(setActiveServer(SERVER_ID));
  return store;
}

type Store = ReturnType<typeof makeStore>;

async function renderScreen(store: Store) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return render(<AudiomuseView />, { wrapper: Wrapper });
}

const connection = (store: Store) => store.getState().audiomuse.byServer[SERVER_ID];

describe('AudiomuseView', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _clearCredentialCache();
    mockTestConnection.mockReset().mockResolvedValue(undefined);
    (notify.error as jest.Mock).mockClear();
    (notify.info as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects and enables AudioMuse-AI after a URL and token pass the connection test', async () => {
    const store = makeStore();
    const view = await renderScreen(store);

    await fireEvent.changeText(view.getByPlaceholderText('settings.audiomuse.serverUrlPlaceholder'), 'http://audiomuse');
    await fireEvent.changeText(view.getByPlaceholderText('settings.audiomuse.apiTokenPlaceholder'), 'typed-token');
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {});

    expect(mockTestConnection).toHaveBeenCalledWith({ serverUrl: 'http://audiomuse', apiToken: 'typed-token' });
    expect(connection(store)).toMatchObject({ isAuthenticated: true, isEnabled: true });
    expect(getCredentials(audiomuseCredentialScope(SERVER_ID)).apiKey).toBe('typed-token');
    expect(JSON.stringify(store.getState())).not.toContain('typed-token');
  });

  it('stays off and reports a failed connection test', async () => {
    mockTestConnection.mockRejectedValue(new Error('401'));
    const store = makeStore();
    const view = await renderScreen(store);

    await fireEvent.changeText(view.getByPlaceholderText('settings.audiomuse.serverUrlPlaceholder'), 'http://audiomuse');
    await fireEvent.changeText(view.getByPlaceholderText('settings.audiomuse.apiTokenPlaceholder'), 'bad-token');
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {});

    expect(connection(store)).toMatchObject({ isAuthenticated: false, isEnabled: false });
    expect(notify.error).toHaveBeenCalledWith('settings.audiomuse.connectionFailed');
  });

  it('disconnecting turns it off and forgets the token', async () => {
    const store = makeStore();
    store.dispatch(setAudiomuseServerUrl({ serverId: SERVER_ID, value: 'http://audiomuse' }));
    store.dispatch(connectAudiomuse({ serverId: SERVER_ID }));
    await setCredential(audiomuseCredentialScope(SERVER_ID), 'apiKey', 'saved-token');
    const view = await renderScreen(store);

    await fireEvent.press(view.getByText('settings.audiomuse.disconnect'));
    await act(async () => {});

    expect(connection(store)).toMatchObject({ serverUrl: '', isAuthenticated: false, isEnabled: false });
    expect(getCredentials(audiomuseCredentialScope(SERVER_ID)).apiKey).toBeUndefined();
    expect(notify.info).toHaveBeenCalledWith('settings.audiomuse.disconnected');
  });
});
