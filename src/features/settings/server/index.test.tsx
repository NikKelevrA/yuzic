import React, { type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import ServerSettings from './';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import settingsSearchReducer from '@/features/settings/search/state';
import settingsPlaybackReducer from '@/features/settings/playback/state';
import settingsHomeReducer from '@/features/settings/home/state';
import settingsAppearanceReducer from '@/features/settings/appearance/state';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The server adapter — HTTP. What it implements decides which switches exist.
jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => mockApi,
}));

// Imports and stores a certificate through the native engine and the document
// picker; it has its own screen-level concerns.
jest.mock('./components/ClientCertificateCard', () => () => null);

/* eslint-disable no-var -- hoisted for the jest.mock factories above */
var mockApi: { auth: { ping: jest.Mock }; queue?: object; discovery?: object };
/* eslint-enable no-var */

function makeStore({ withServer = true } = {}) {
  const store = configureStore({
    reducer: {
      servers: serversReducer,
      settingsSearch: settingsSearchReducer,
      settingsPlayback: settingsPlaybackReducer,
      settingsHome: settingsHomeReducer,
      settingsAppearance: settingsAppearanceReducer,
    },
  });
  if (withServer) {
    store.dispatch(addServer({
      id: 'server-1',
      type: 'navidrome',
      serverUrl: 'https://music.example',
      username: 'listener',
      isAuthenticated: true,
    }));
    store.dispatch(setActiveServer('server-1'));
  }
  return store;
}

type Store = ReturnType<typeof makeStore>;

async function renderScreen(store: Store) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return render(<ServerSettings />, { wrapper: Wrapper });
}

describe('ServerSettings', () => {
  beforeEach(() => {
    // The screen pings after a pause; the timer is left unrun so no request
    // lands after a test has finished.
    jest.useFakeTimers();
    mockApi = { auth: { ping: jest.fn().mockResolvedValue(undefined) } };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing without an active server', async () => {
    const view = await renderScreen(makeStore({ withServer: false }));

    expect(view.queryByText('settings.server.title')).toBeNull();
  });

  it('shows the server address without its scheme, and the username', async () => {
    const view = await renderScreen(makeStore());

    expect(view.getByText('music.example')).toBeTruthy();
    expect(view.getByText('listener')).toBeTruthy();
  });

  it('shows no privacy switches when the server cannot back them', async () => {
    const view = await renderScreen(makeStore());

    expect(view.queryByText('settings.server.privacyTitle')).toBeNull();
    expect(view.queryAllByRole('switch')).toHaveLength(0);
  });

  it('offers queue sync and the now-playing shelf where the adapter implements them, and writes both', async () => {
    mockApi = { ...mockApi, queue: {}, discovery: {} };
    const store = makeStore();
    const view = await renderScreen(store);

    expect(view.getByText('settings.server.queueSync')).toBeTruthy();
    expect(view.getByText('settings.server.nowPlayingShelf')).toBeTruthy();
    const [queueSync, nowPlayingShelf] = view.getAllByRole('switch');
    await fireEvent(queueSync, 'valueChange', false);
    await fireEvent(nowPlayingShelf, 'valueChange', false);

    expect(store.getState().settingsPlayback.queueSyncEnabled).toBe(false);
    expect(store.getState().settingsHome.serverNowPlayingShelfEnabled).toBe(false);
  });

  it('writes the chosen search scope', async () => {
    const store = makeStore();
    expect(store.getState().settingsSearch.searchScope).toBe('server');
    const view = await renderScreen(store);

    await fireEvent.press(view.getByText('settings.server.searchScope.client'));

    expect(store.getState().settingsSearch.searchScope).toBe('client');
  });
});
