import type { CoverSource } from '@/types/Cover';
import type { LocalId } from '../identity/LocalId';
import type { EntityCore } from './EntityCore';
import type { ArtistRef } from './EntityRef';

/** What an album release is, where the origin says. */
export type ReleaseType = 'album' | 'single' | 'ep' | 'compilation';

/**
 * One album.
 *
 * Songs are referenced, not embedded: an album's track list is separately
 * loaded, and an album that browses fine without it should not have to fetch
 * it. `songIds` is empty until the tracks have been loaded, which is a
 * different statement from an album that genuinely has none — callers that
 * care ask the song repository rather than inferring it from length.
 */
export interface Album extends EntityCore {
  title: string;
  cover: CoverSource;
  artist: ArtistRef;
  /** Release year, where the origin reports one. */
  year?: number;
  /** Full release date as reported, where finer than a year. */
  releaseDate?: string;
  releaseType: ReleaseType;
  genres: string[];
  /** When this arrived in the library, unix ms. Server-originated records only. */
  addedAt?: number;
  /** Tracks that have been loaded, in running order, as references. */
  songIds: LocalId[];
}
