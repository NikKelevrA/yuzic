/**
 * The local-first rule, for components.
 *
 * Reads the already-loaded catalog — the same persisted query cache every
 * library screen reads, so this starts no fetch of its own — and memoises the
 * index on it, so a shelf of ten rows costs one index build rather than ten
 * scans of the library. The rule itself is in `localFirst.ts`, which stays
 * pure; this is only the half that knows where the library lives.
 *
 * **The memo has to be shared, not per component.** That sentence above was
 * the intent and `useMemo` was the implementation, and `useMemo` is per
 * component *instance*: `SongRow` calls this hook, so every row on screen
 * built its own index of the whole library. Fifteen rows meant fifteen builds
 * and fifteen copies of two Maps over every song, album and artist. Measured
 * on a 90,000 track library that is about 311 ms per build on desktop V8, so
 * roughly five seconds of index building to fill one screen, and Hermes on a
 * phone is slower again. It is the sluggish scrolling people reported.
 */
import { useMemo } from 'react';

import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import { useAlbums } from '@/features/album/useAlbums';
import { useArtists } from '@/features/artist/useArtists';
import { useTracks } from '@/features/song/useTracks';
import {
  buildLibraryIndex,
  localAlbum,
  localArtist,
  localSong,
  preferLocalSong,
  type LibraryIndex,
} from './localFirst';

interface LocalFirst {
  /** The index itself, for a caller resolving a whole list in one pass. */
  index: LibraryIndex;
  localSong: (song: Song) => Song | null;
  localAlbum: (album: Album) => Album | null;
  localArtist: (artist: Artist) => Artist | null;
  preferLocalSong: (song: Song) => Song;
}

/**
 * The one index, and the arrays it was built from.
 *
 * Module scope rather than a context, because the inputs are already shared:
 * every caller reads the same three arrays out of the query cache, so their
 * identities are the cache key. A context would need a provider mounted above
 * every consumer to say the same thing.
 *
 * Holding the arrays costs nothing extra — the query cache holds them anyway,
 * and this keeps one index alive where there used to be one per row.
 */
let shared: {
  songs: readonly Song[];
  albums: readonly Album[];
  artists: readonly Artist[];
  index: LibraryIndex;
} | null = null;

function sharedLibraryIndex(
  songs: readonly Song[],
  albums: readonly Album[],
  artists: readonly Artist[]
): LibraryIndex {
  if (
    shared &&
    shared.songs === songs &&
    shared.albums === albums &&
    shared.artists === artists
  ) {
    return shared.index;
  }
  const index = buildLibraryIndex({ songs, albums, artists });
  shared = { songs, albums, artists, index };
  return index;
}

/** For tests: forget the shared index so one case cannot leak into the next. */
export function _resetLibraryIndex(): void {
  shared = null;
}

export function useLocalFirst(): LocalFirst {
  const { albums } = useAlbums();
  const { artists } = useArtists();
  const { tracks } = useTracks();

  // Still memoised per component, so a re-render with unchanged arrays does
  // not even reach the shared lookup; the cache above is what stops a second
  // *component* paying for the build.
  const index = useMemo(
    () => sharedLibraryIndex(tracks, albums, artists),
    [tracks, albums, artists]
  );

  return useMemo(
    () => ({
      index,
      localSong: (song: Song) => localSong(index, song),
      localAlbum: (album: Album) => localAlbum(index, album),
      localArtist: (artist: Artist) => localArtist(index, artist),
      preferLocalSong: (song: Song) => preferLocalSong(index, song),
    }),
    [index]
  );
}
