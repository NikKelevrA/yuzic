import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import type { Server } from '@/providers/contracts/Server';
import { QueryKeys } from '@/state/query/queryKeys';
import { clearCatalog, writeCatalogResource } from './catalogPersistence';
import { catalogSyncKey } from './catalogQueries';
import { useCatalogHydration } from './useCatalogHydration';

const SERVER_ID = 'server-1';

const testServer = (): Server => ({
  id: SERVER_ID,
  type: 'navidrome',
  serverUrl: 'https://example.com',
  username: 'u',
  isAuthenticated: true,
});

function makeStore({ connected = true }: { connected?: boolean } = {}) {
  const store = configureStore({ reducer: { servers: serversReducer } });
  if (connected) {
    store.dispatch(addServer(testServer()));
    store.dispatch(setActiveServer(SERVER_ID));
  }
  return store;
}

const clients: QueryClient[] = [];
const makeClient = () => {
  const created = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(created);
  return created;
};

/**
 * The hook is unmounted by hand, before the client it writes to is torn down.
 *
 * Hydration yields between resources, so it is still mid-loop when a test's
 * assertions pass. Left running, it reaches its next `setQueryData` after the
 * client was cleared, which schedules a notify timer on a client nobody
 * observes any more — jest force-exits the worker over it. Unmounting is what
 * sets the hook's `cancelled` flag, so the loop stops first.
 */
const mounted: { unmount: () => Promise<void> }[] = [];

afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  clients.splice(0).forEach(created => {
    created.clear();
    // `clear` is queries only, and the sync cases below leave a mutation.
    created.getMutationCache().clear();
    created.unmount();
  });
  clearCatalog();
});

async function render(store: ReturnType<typeof makeStore>, queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
  Wrapper.displayName = 'TestCatalogWrapper';
  const view = await renderHook(() => useCatalogHydration(), { wrapper: Wrapper });
  mounted.push(view);
  return view;
}

describe('useCatalogHydration', () => {
  it('puts a stored resource into the key the screens read', async () => {
    writeCatalogResource(SERVER_ID, 'albums', [{ nativeId: 'al1' }]);
    const queryClient = makeClient();

    await render(makeStore(), queryClient);

    await waitFor(() => {
      expect(queryClient.getQueryData([QueryKeys.Albums, SERVER_ID])).toEqual([
        { nativeId: 'al1' },
      ]);
    });
  });

  it('hydrates every resource, not only the first', async () => {
    writeCatalogResource(SERVER_ID, 'albums', [{ nativeId: 'al1' }]);
    writeCatalogResource(SERVER_ID, 'tracks', [{ nativeId: 'tr1' }]);
    writeCatalogResource(SERVER_ID, 'genres', ['Rock']);
    const queryClient = makeClient();

    await render(makeStore(), queryClient);

    await waitFor(() => {
      expect(queryClient.getQueryData([QueryKeys.Tracks, SERVER_ID])).toEqual([
        { nativeId: 'tr1' },
      ]);
      expect(queryClient.getQueryData([QueryKeys.Genres, SERVER_ID])).toEqual(['Rock']);
    });
  });

  it('hydrates tracks last, so the largest list blocks nothing', async () => {
    // Everything Home and Library draw comes from the other five. Tracks is
    // most of a big library's bytes on its own, and going first meant all of
    // them waited behind the one list neither screen reads.
    writeCatalogResource(SERVER_ID, 'albums', [{ nativeId: 'al1' }]);
    writeCatalogResource(SERVER_ID, 'tracks', [{ nativeId: 'tr1' }]);
    const queryClient = makeClient();
    const order: string[] = [];
    const setQueryData = jest
      .spyOn(queryClient, 'setQueryData')
      .mockImplementation(key => {
        order.push(String((key as unknown[])[0]));
        return undefined;
      });

    await render(makeStore(), queryClient);

    await waitFor(() => expect(order).toHaveLength(2));
    expect(order).toEqual([QueryKeys.Albums, QueryKeys.Tracks]);
    setQueryData.mockRestore();
  });

  it('leaves a key a sync already filled alone', async () => {
    // The stored copy is the older one by definition: a sync writes the cache
    // and the store together, and hydration only ever runs behind it.
    writeCatalogResource(SERVER_ID, 'albums', [{ nativeId: 'stale' }]);
    const queryClient = makeClient();
    queryClient.setQueryData([QueryKeys.Albums, SERVER_ID], [{ nativeId: 'fresh' }]);

    await render(makeStore(), queryClient);

    await waitFor(() => {
      expect(queryClient.getQueryData([QueryKeys.Tracks, SERVER_ID])).toBeUndefined();
    });
    expect(queryClient.getQueryData([QueryKeys.Albums, SERVER_ID])).toEqual([
      { nativeId: 'fresh' },
    ]);
  });

  it('writes nothing for a resource the store has never held', async () => {
    writeCatalogResource(SERVER_ID, 'albums', [{ nativeId: 'al1' }]);
    const queryClient = makeClient();

    await render(makeStore(), queryClient);

    await waitFor(() => {
      expect(queryClient.getQueryData([QueryKeys.Albums, SERVER_ID])).toBeDefined();
    });
    // Undefined means "ask the server", which is what a screen must see for a
    // resource that was never stored. An empty array would read as an empty
    // library and never be refetched under `staleTime: Infinity`.
    expect(queryClient.getQueryData([QueryKeys.Tracks, SERVER_ID])).toBeUndefined();
  });

  it('does nothing without an active server', async () => {
    writeCatalogResource(SERVER_ID, 'albums', [{ nativeId: 'al1' }]);
    const queryClient = makeClient();

    await render(makeStore({ connected: false }), queryClient);

    await waitFor(() => {
      expect(queryClient.getQueryData([QueryKeys.Albums, SERVER_ID])).toBeUndefined();
    });
  });

  describe('while a sync is running', () => {
    /**
     * A catalog sync in flight, under the key the app uses, and the handle
     * that lets it finish. The hook watches the mutation cache, so a real
     * mutation is what it has to see — not a flag.
     */
    function syncInFlight(queryClient: QueryClient) {
      let finish: () => void = () => {};
      const done = new Promise<void>(resolve => {
        finish = resolve;
      });
      const running = queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationKey: catalogSyncKey(SERVER_ID),
          mutationFn: () => done,
          // A settled mutation otherwise keeps a garbage-collection timer,
          // which is enough on its own to hold the jest worker open.
          gcTime: 0,
        })
        .execute(undefined)
        .catch(() => {});
      return { finish, running };
    }

    it('holds the stored tracks back rather than sitting next to what replaces them', async () => {
      // The whole point: a start that is going to sync ends up with the
      // server's copy either way, and reading the stored one first means
      // holding both while the fetch runs. At 90,000 tracks that is the crash.
      writeCatalogResource(SERVER_ID, 'albums', [{ nativeId: 'al1' }]);
      writeCatalogResource(SERVER_ID, 'tracks', [{ nativeId: 'stored' }]);
      const queryClient = makeClient();
      const sync = syncInFlight(queryClient);

      await render(makeStore(), queryClient);

      // Albums do not wait — they are what Home and Library paint with.
      await waitFor(() => {
        expect(queryClient.getQueryData([QueryKeys.Albums, SERVER_ID])).toBeDefined();
      });
      expect(queryClient.getQueryData([QueryKeys.Tracks, SERVER_ID])).toBeUndefined();

      sync.finish();
      await sync.running;
    });

    it('lets the sync own the tracks it fetched', async () => {
      writeCatalogResource(SERVER_ID, 'tracks', [{ nativeId: 'stored' }]);
      const queryClient = makeClient();
      const sync = syncInFlight(queryClient);

      await render(makeStore(), queryClient);

      // What a sync does, while hydration is waiting on it.
      queryClient.setQueryData([QueryKeys.Tracks, SERVER_ID], [{ nativeId: 'fresh' }]);
      sync.finish();
      await sync.running;

      await waitFor(() => {
        expect(queryClient.getQueryData([QueryKeys.Tracks, SERVER_ID])).toEqual([
          { nativeId: 'fresh' },
        ]);
      });
    });

    it('still falls back to the stored tracks when the sync brings none', async () => {
      // Waiting rather than skipping is what keeps the offline story: a sync
      // that failed, or failed for tracks alone, leaves the cache empty and
      // the stored copy goes in as it always did.
      writeCatalogResource(SERVER_ID, 'tracks', [{ nativeId: 'stored' }]);
      const queryClient = makeClient();
      const sync = syncInFlight(queryClient);

      await render(makeStore(), queryClient);
      expect(queryClient.getQueryData([QueryKeys.Tracks, SERVER_ID])).toBeUndefined();

      sync.finish();
      await sync.running;

      await waitFor(() => {
        expect(queryClient.getQueryData([QueryKeys.Tracks, SERVER_ID])).toEqual([
          { nativeId: 'stored' },
        ]);
      });
    });
  });
});
