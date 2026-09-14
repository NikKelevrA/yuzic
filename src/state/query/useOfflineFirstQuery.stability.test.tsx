import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { usePlaylists } from '@/features/playlist/usePlaylists';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import type { Server } from '@/providers/contracts/Server';

// Offline, so the list query never runs: the catalog stays empty for the
// whole test, which is the state the bug needs.
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: false, isInternetReachable: false }),
}));

jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => ({
    playlists: { list: jest.fn(() => Promise.reject(new Error('offline: must not fetch'))) },
  }),
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

async function renderWithCatalog(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({ reducer: { servers: serversReducer } });
  store.dispatch(addServer(testServer()));
  store.dispatch(setActiveServer(SERVER_ID));
  // `render` is async in this testing-library version — it wraps the initial
  // render in `act` and has to be awaited before anything is read from it.
  const utils = await render(
    <QueryClientProvider client={client}>
      <Provider store={store}>{ui}</Provider>
    </QueryClientProvider>
  );
  return { client, ...utils };
}

describe('useOfflineFirstQuery with nothing cached', () => {
  it('hands back the same empty value on every render', async () => {
    const seen: unknown[] = [];
    let rerender: () => void = () => {};

    function Probe() {
      const { playlists } = usePlaylists();
      const [, setTick] = useState(0);
      rerender = () => setTick(t => t + 1);
      seen.push(playlists);
      return <Text>{playlists.length}</Text>;
    }

    const { client, unmount } = await renderWithCatalog(<Probe />);
    await act(async () => { rerender(); });
    await act(async () => { rerender(); });

    expect(seen.length).toBeGreaterThanOrEqual(3);
    // A fresh `[]` each render reads as "the playlists changed" to every memo
    // and effect keyed on it.
    for (const value of seen) expect(value).toBe(seen[0]);

    await unmount();
    client.clear();
    client.unmount();
  });

  it('does not send a consumer that syncs state from it into a render loop', async () => {
    // The shape `PlaylistList` has: derive something from the list in a memo,
    // then copy it into state in an effect. With an unstable empty list this
    // re-ran every render — "Maximum update depth exceeded", 120 times on the
    // simulator, from the playing bar, whenever the catalog was empty.
    const renders = { count: 0 };

    function Consumer() {
      const { playlists } = usePlaylists();
      const ids = React.useMemo(() => new Set(playlists.map(p => p.nativeId)), [playlists]);
      const [, setSelected] = useState<Set<string>>(new Set());
      const count = useRef(0);
      count.current += 1;
      renders.count = count.current;
      useEffect(() => { setSelected(new Set(ids)); }, [ids]);
      return <Text>{ids.size}</Text>;
    }

    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client, unmount } = await renderWithCatalog(<Consumer />);

    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining('Maximum update depth'));
    expect(renders.count).toBeLessThan(10);

    errors.mockRestore();
    await unmount();
    client.clear();
    client.unmount();
  });
});
