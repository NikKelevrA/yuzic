import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAlbums } from '@/features/album/useAlbums';
import serversReducer, { addServer, setActiveServer, setCredentialsHydrated } from '@/state/redux/slices/serversSlice';
import type { Server } from '@/providers/contracts/Server';

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

const mockListAlbums = jest.fn(() => Promise.resolve([]));
jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => ({ albums: { list: mockListAlbums, get: jest.fn() } }),
}));

const SERVER_ID = 'server-1';

function testServer(): Server {
  return {
    id: SERVER_ID,
    type: 'navidrome',
    serverUrl: 'https://example.com',
    username: 'u',
    isAuthenticated: true,
  };
}

function Albums() {
  const { albums } = useAlbums();
  return <Text>{albums.length}</Text>;
}

/**
 * Nothing is asked of a server before its credentials are loaded.
 *
 * The secrets live in the keystore and arrive a moment after launch
 * (`useCredentialHydration`). A query that ran in that window was built with an
 * empty password, the server refused it, and — with `staleTime: Infinity` —
 * whatever came back stood in for the library from then on.
 */
describe('useOfflineFirstQuery before the keystore read lands', () => {
  beforeEach(() => mockListAlbums.mockClear());

  it('waits for credentials, then fetches', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const store = configureStore({ reducer: { servers: serversReducer } });
    store.dispatch(addServer(testServer()));
    store.dispatch(setActiveServer(SERVER_ID));

    const { unmount } = await render(
      <QueryClientProvider client={client}>
        <Provider store={store}><Albums /></Provider>
      </QueryClientProvider>
    );

    expect(mockListAlbums).not.toHaveBeenCalled();

    await act(async () => { store.dispatch(setCredentialsHydrated(true)); });

    expect(mockListAlbums).toHaveBeenCalledTimes(1);
    unmount();
    client.clear();
  });
});
