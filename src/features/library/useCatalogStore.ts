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

let shared: {
  songs: readonly Song[];
  albums: readonly Album[];
  artists: readonly Artist[];
  playlists: readonly Playlist[];
  store: CatalogStore;
} | null = null;

function sharedStore(
  songs: readonly Song[],
  albums: readonly Album[],
  artists: readonly Artist[],
  playlists: readonly Playlist[]
): CatalogStore {
  if (
    shared &&
    shared.songs === songs &&
    shared.albums === albums &&
    shared.artists === artists &&
    shared.playlists === playlists
  ) {
    return shared.store;
  }
  const store = buildCatalogStore({ songs, albums, artists, playlists });
  shared = { songs, albums, artists, playlists, store };
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
