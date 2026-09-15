import React, { type ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { useLibraryState } from './useLibraryState';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';
import type { Album } from '@/domain/entities/Album';
import wantsReducer, { addWant } from '@/state/redux/slices/wantsSlice';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import downloadersReducer from '@/state/redux/slices/downloadersSlice';
import type { Server } from '@/providers/contracts/Server';

jest.mock('@/features/album/useAlbums', () => ({ useAlbums: () => ({ albums: [] }) }));

function makeStore() {
  return configureStore({
    reducer: {
      wants: wantsReducer,
      servers: serversReducer,
      downloaders: downloadersReducer,
    },
  });
}

function wrapper(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return Wrapper;
}

const SERVER_ID = 'server-1';
const PROVENANCE = integrationProvenance('deezer');

function testServer(): Server {
  return {
    id: SERVER_ID,
    type: 'jellyfin',
    serverUrl: 'https://example.com',
    username: 'u',
    isAuthenticated: true,
  };
}

function externalAlbum(nativeId = 'ext-1'): Album {
  return {
    localId: makeLocalId('album', PROVENANCE, nativeId),
    nativeId,
    provenance: PROVENANCE,
    externalIds: {},
    libraryState: 'external',
    title: 'Some Album',
    cover: { kind: 'none' },
    artist: {
      localId: makeLocalId('artist', PROVENANCE, 'artist-1'),
      nativeId: 'artist-1',
      externalIds: {},
      name: 'Some Artist',
      cover: { kind: 'none' },
    },
    releaseType: 'album',
    genres: [],
    songIds: [],
  };
}

describe('useLibraryState', () => {
  it('resolves to external (not wanted) when the store has no want for the localId', async () => {
    const store = makeStore();
    store.dispatch(addServer(testServer()));
    store.dispatch(setActiveServer(SERVER_ID));

    const album = externalAlbum();
    const { result } = await renderHook(() => useLibraryState(album), {
      wrapper: wrapper(store),
    });

    expect(result.current).toBe('external');
  });

  it('resolves to wanted when the store has an addWant entry for the album localId', async () => {
    const store = makeStore();
    store.dispatch(addServer(testServer()));
    store.dispatch(setActiveServer(SERVER_ID));

    const album = externalAlbum();
    store.dispatch(addWant({
      serverId: SERVER_ID,
      want: { localId: album.localId, unit: 'album', title: 'Some Album', artist: 'Some Artist', origin: 'search' },
    }));

    const { result } = await renderHook(() => useLibraryState(album), {
      wrapper: wrapper(store),
    });

    expect(result.current).toBe('wanted');
  });

  it('is never wanted when the album has a different localId than any want', async () => {
    const store = makeStore();
    store.dispatch(addServer(testServer()));
    store.dispatch(setActiveServer(SERVER_ID));

    const album = externalAlbum('unrelated');
    const { result } = await renderHook(() => useLibraryState(album), {
      wrapper: wrapper(store),
    });

    expect(result.current).toBe('external');
  });
});
