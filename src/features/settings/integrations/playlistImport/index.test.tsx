import React, { type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import PlaylistImportView from './';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import playlistImportReducer, { connectPlaylistImport } from '@/state/redux/slices/playlistImportSlice';

// Boundaries only: the watchlist proxy's HTTP call, the toast and i18n.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/toast', () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockTestConnection = jest.fn();
jest.mock('@/providers/integration/playlistImport', () => ({
  testConnection: (...args: unknown[]) => mockTestConnection(...args),
}));

import { notify } from '@/components/toast';

const SERVER_ID = 'server-1';

function makeStore() {
  const store = configureStore({
    reducer: { servers: serversReducer, playlistImport: playlistImportReducer },
  });
  store.dispatch(addServer({
    id: SERVER_ID,
    type: 'navidrome',
    serverUrl: 'https://music.example',
    username: 'christina',
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
  return render(<PlaylistImportView />, { wrapper: Wrapper });
}

const connection = (store: Store) => store.getState().playlistImport.byServer[SERVER_ID];

describe('PlaylistImportView', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockTestConnection.mockReset().mockResolvedValue(undefined);
    (notify.error as jest.Mock).mockClear();
    (notify.info as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects and enables playlist import once a server URL passes the connection test', async () => {
    const store = makeStore();
    const view = await renderScreen(store);

    await fireEvent.changeText(
      view.getByPlaceholderText('settings.playlistImport.serverUrlPlaceholder'),
      'http://192.168.1.43:5001'
    );
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {});

    // The active server's own username is what the proxy expects as target_user.
    expect(mockTestConnection).toHaveBeenCalledWith({ serverUrl: 'http://192.168.1.43:5001', targetUser: 'christina' });
    expect(connection(store)).toMatchObject({ isAuthenticated: true, isEnabled: true });
  });

  it('stays off and reports a failed connection test', async () => {
    mockTestConnection.mockRejectedValue(new Error('unreachable'));
    const store = makeStore();
    const view = await renderScreen(store);

    await fireEvent.changeText(
      view.getByPlaceholderText('settings.playlistImport.serverUrlPlaceholder'),
      'http://192.168.1.43:5001'
    );
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {});

    expect(connection(store)).toMatchObject({ isAuthenticated: false, isEnabled: false });
    expect(notify.error).toHaveBeenCalledWith('settings.playlistImport.connectionFailed');
  });

  it('disconnecting turns it off and clears the server URL', async () => {
    const store = makeStore();
    store.dispatch(connectPlaylistImport({ serverId: SERVER_ID }));
    const view = await renderScreen(store);

    await fireEvent.press(view.getByText('settings.playlistImport.disconnect'));
    await act(async () => {});

    expect(connection(store)).toMatchObject({ serverUrl: '', isAuthenticated: false, isEnabled: false });
    expect(notify.info).toHaveBeenCalledWith('settings.playlistImport.disconnected');
  });
});
