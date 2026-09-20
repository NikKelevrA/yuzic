/**
 * The local-first rule, for components.
 *
 * Reads the identity index off the catalog store, which builds it once for
 * the whole app and only when something first asks — see `match` in
 * `catalogStore`. The rule itself is in `localFirst.ts`, which stays pure;
 * this is only the half that knows where the library lives.
 *
 * **This hook used to build the index itself**, in a `useMemo`. `useMemo` is
 * per component *instance*, and `SongRow` calls this hook, so every row on
 * screen built its own index of the entire library: fifteen rows meant
 * fifteen builds and fifteen copies of two Maps over every song, album and
 * artist. At 90,000 tracks one build is about 311 ms, so roughly five seconds
 * of index building to fill a single screen. It was fixed here first with a
 * cache of its own; the store subsumes that, and one shared thing is better
 * than two.
 */
import { useMemo } from 'react';

import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import { useCatalogStore } from './useCatalogStore';
import {
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

export function useLocalFirst(): LocalFirst {
  const store = useCatalogStore();

  return useMemo(() => {
    // Reading `store.match` here is what builds it, the first time any
    // component asks. Inside the memo so a screen that never renders a row
    // never pays for it.
    const index = store.match;
    return {
      index,
      localSong: (song: Song) => localSong(index, song),
      localAlbum: (album: Album) => localAlbum(index, album),
      localArtist: (artist: Artist) => localArtist(index, artist),
      preferLocalSong: (song: Song) => preferLocalSong(index, song),
    };
  }, [store]);
}
