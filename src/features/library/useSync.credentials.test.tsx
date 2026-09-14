import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSync } from '@/features/library/useSync';
import serversReducer, { addServer, setActiveServer, setCredentialsHydrated } from '@/state/redux/slices/serversSlice';
import settingsSyncReducer from '@/features/settings/sync/state';
import type { Server } from '@/providers/contracts/Server';

const mockRunCatalogSync = jest.fn(() => Promise.resolve({
  failed: [], hasData: false, genres: undefined, albumStats: [], songStats: [],
}));
jest.mock('@/features/library/catalogSync', () => ({
  runCatalogSync: (...args: unknown[]) => mockRunCatalogSync(...(args as [])),
}));
jest.mock('@/providers/registry/useApi', () => ({ useApi: () => ({}) }));

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

/**
 * A sync before the keystore read is a request with an empty password: the
 * server refuses it and the refusal is cached for good. It must wait.
 */
describe('useSync before credentials are loaded', () => {
  beforeEach(() => mockRunCatalogSync.mockClear());

  it('does not run until they are, and runs once they are', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Only the slices `useSync` reads. The app's `rootReducer` would pull in
    // `store.ts`, which starts redux-persist on import and keeps jest alive.
    const store = configureStore({ reducer: { servers: serversReducer, settingsSync: settingsSyncReducer } });
    store.dispatch(addServer(testServer()));
    store.dispatch(setActiveServer(SERVER_ID));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <Provider store={store}>{children}</Provider>
      </QueryClientProvider>
    );
    const { result } = await renderHook(() => useSync(), { wrapper });

    await act(async () => { await result.current.sync(true); });
    expect(mockRunCatalogSync).not.toHaveBeenCalled();

    await act(async () => { store.dispatch(setCredentialsHydrated(true)); });
    await act(async () => { await result.current.sync(true); });
    expect(mockRunCatalogSync).toHaveBeenCalledTimes(1);

    client.clear();
  });
});
