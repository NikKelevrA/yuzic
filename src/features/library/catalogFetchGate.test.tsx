/**
 * A cold start reads the library off disk. It does not download it again.
 *
 * The catalog hooks used to fetch the moment they mounted, which on a cold
 * start is before hydration has run: hydration waits for idle, deliberately,
 * so the app paints first. So every screen found its cache entry empty and
 * started a full paged fetch of a library the device already had stored. The
 * stored copy and the fetched copy then sat in memory together, which at
 * 90,000 tracks aborted Hermes — and on a phone it is the whole library over
 * mobile data, every launch.
 *
 * `useCatalogHydrated` is the gate. This checks the hooks are actually behind
 * it, because the failure is silent: everything works, it just costs a library.
 */
import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import type { Server } from '@/providers/contracts/Server';

const SERVER_ID = 'server-1';

const mockList = jest.fn(async () => [{ nativeId: 'from-the-server' }]);

jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => ({
    tracks: { list: mockList },
    albums: { list: mockList },
    artists: { list: mockList },
    playlists: { list: mockList },
    genres: { list: mockList },
    starred: { list: jest.fn(async () => ({ songs: [], albums: [] })) },
  }),
}));

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

import { useTracks } from '@/features/song/useTracks';
import { clearCatalog, writeCatalogResource } from './catalogPersistence';
import { useCatalogHydration, _resetCatalogHydration } from './useCatalogHydration';

const testServer = (): Server => ({
  id: SERVER_ID,
  type: 'navidrome',
  serverUrl: 'https://example.com',
  username: 'u',
  isAuthenticated: true,
});

const clients: QueryClient[] = [];
const mounted: { unmount: () => Promise<void> }[] = [];

function makeStore() {
  const store = configureStore({ reducer: { servers: serversReducer } });
  store.dispatch(addServer(testServer()));
  store.dispatch(setActiveServer(SERVER_ID));
  return store;
}

async function render<T>(hook: () => T) {
  const store = makeStore();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
  Wrapper.displayName = 'TestGateWrapper';
  const view = await renderHook(hook, { wrapper: Wrapper });
  mounted.push(view);
  return view;
}

beforeEach(() => {
  _resetCatalogHydration();
  clearCatalog();
  mockList.mockClear();
});

afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  clients.splice(0).forEach(created => {
    created.clear();
    created.getMutationCache().clear();
    created.unmount();
  });
  clearCatalog();
});

describe('the catalog fetch gate', () => {
  it('asks the server for nothing while the stored catalog is still loading', async () => {
    writeCatalogResource(SERVER_ID, 'tracks', [{ nativeId: 'from-the-disk' }]);

    // The hook on its own: nothing is hydrating, so nothing has announced.
    await render(() => useTracks());

    expect(mockList).not.toHaveBeenCalled();
  });

  it('reads what hydration put there, without a request', async () => {
    writeCatalogResource(SERVER_ID, 'tracks', [{ nativeId: 'from-the-disk' }]);

    const view = await render(() => {
      useCatalogHydration();
      return useTracks();
    });

    await waitFor(() => {
      expect(view.result.current.tracks).toEqual([{ nativeId: 'from-the-disk' }]);
    });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('asks the server once hydration has nothing to offer', async () => {
    // A first install, or a resource never stored. The gate delays the fetch;
    // it must not cancel it.
    await render(() => {
      useCatalogHydration();
      return useTracks();
    });

    await waitFor(() => expect(mockList).toHaveBeenCalled());
  });
});
