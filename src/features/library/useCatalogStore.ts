/**
 * The catalog store, for components.
 *
 * Reads the already-loaded catalog — the same persisted query cache every
 * library screen reads, so this starts no fetch of its own — and builds the
 * store once for the whole app.
 *
 * **Once for the app, not once per component.** `useMemo` is per component
 * instance, which is how `useLocalFirst` ended up building an index of the
 * entire library inside every visible `SongRow`: fifteen rows meant fifteen
 * builds. The memo below still guards a re-render, but the cache underneath
 * is what stops a second *component* paying for the build.
 *
 * Keyed on the identity of the three arrays, because that is exactly what
 * changes when a sync lands, and the arrays are already shared: every caller
 * reads the same ones out of the query cache. A context would need a provider
 * mounted above every consumer to say the same thing.
 *
 * **Weakly, all of it.** See `shared` below: holding a catalog strongly from
 * module scope is a second copy of the library that nothing can reclaim.
 */
import { useMemo } from 'react';

import { useAlbums } from '@/features/album/useAlbums';
import { useArtists } from '@/features/artist/useArtists';
import { useTracks } from '@/features/song/useTracks';
import { usePlaylists } from '@/features/playlist/usePlaylists';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import type { Playlist } from '@/domain/entities/Playlist';
import { buildCatalogStore, type CatalogStore } from './catalogStore';

/**
 * The store for whichever catalog the query cache is currently holding.
 *
 * Every field is a `WeakRef`, and that is the whole point of the shape. Held
 * strongly, this is a module-level reference to an entire library — the four
 * arrays, every entity in them, and the indexes over them — that outlives
 * every component and nothing can reclaim. A sync replaces the arrays in the
 * cache; until something re-renders and rebuilds, this still points at the
 * old ones, so the device holds two libraries. Measured on a 44,939 track
 * catalog: replacing the tracks array added 109 MB of live heap, and clearing
 * this cache gave back exactly 109 MB. Nothing else was holding it.
 *
 * Weakly, the cache can only ever notice what is still in use. When any ref
 * has been collected the store is rebuilt, which is precisely the case where
 * the cached one was no use anyway.
 */
let shared: {
  songs: WeakRef<readonly Song[]>;
  albums: WeakRef<readonly Album[]>;
  artists: WeakRef<readonly Artist[]>;
  playlists: WeakRef<readonly Playlist[]>;
  store: WeakRef<CatalogStore>;
} | null = null;

function sharedStore(
  songs: readonly Song[],
  albums: readonly Album[],
  artists: readonly Artist[],
  playlists: readonly Playlist[]
): CatalogStore {
  const cached = shared?.store.deref();
  if (
    cached &&
    shared?.songs.deref() === songs &&
    shared?.albums.deref() === albums &&
    shared?.artists.deref() === artists &&
    shared?.playlists.deref() === playlists
  ) {
    return cached;
  }
  const store = buildCatalogStore({ songs, albums, artists, playlists });
  shared = {
    songs: new WeakRef(songs),
    albums: new WeakRef(albums),
    artists: new WeakRef(artists),
    playlists: new WeakRef(playlists),
    store: new WeakRef(store),
  };
  return store;
}

/** For tests: forget the shared store so one case cannot leak into the next. */
export function _resetCatalogStore(): void {
  shared = null;
}

export function useCatalogStore(): CatalogStore {
  const { albums } = useAlbums();
  const { artists } = useArtists();
  const { tracks } = useTracks();
  const { playlists } = usePlaylists();

  return useMemo(
    () => sharedStore(tracks, albums, artists, playlists),
    [tracks, albums, artists, playlists]
  );
}
