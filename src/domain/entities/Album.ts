import type { CoverSource } from '@/domain/entities/Cover';
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
  /**
   * Plays the origin has recorded for this album, where it reports them.
   *
   * Server-reported rather than local: sync seeds the app's own stats from
   * these, so an install that has never played a track still knows what the
   * library has been listening to. Absent is distinct from zero — a server
   * that does not report play counts must not be read as reporting none.
   */
  serverPlayCount?: number;
  /** When the origin last recorded a play, unix ms. Same caveat as above. */
  serverLastPlayedAt?: number;
  /** Tracks that have been loaded, in running order, as references. */
  songIds: LocalId[];
}
