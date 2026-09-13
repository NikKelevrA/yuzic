import type { CoverSource } from '@/types/Cover';
import type { ContentKind } from '../playback/ContentKind';
import type { EntityCore } from './EntityCore';
import type { AlbumRef, ArtistRef } from './EntityRef';

/** Technical detail about the file behind a song, where the origin reports it. */
export interface AudioProperties {
  bitrateKbps?: number;
  sampleRateHz?: number;
  bitsPerSample?: number;
  mimeType?: string;
}

/**
 * One song.
 *
 * `durationSeconds` is a number, not a preformatted `'3:42'` string: a string
 * cannot be summed for an album runtime, compared against a sleep timer, or
 * localised, and every consumer that needed one of those had to parse it back.
 *
 * `contentKind` is required. A live stream, a podcast episode and a 30-second
 * preview are all carried by this type, and each of them breaks an assumption
 * the player would otherwise make — see {@link ContentKind}.
 */
export interface Song extends EntityCore {
  title: string;
  artist: ArtistRef;
  album: AlbumRef;
  cover: CoverSource;
  /** Length in seconds. Zero for content with no known duration. */
  durationSeconds: number;
  contentKind: ContentKind;
  /**
   * The id to build a stream from, where that is not `nativeId`.
   *
   * A podcast episode is keyed by a namespaced id of its own, while its
   * playable audio lives under a different id the server assigns only once it
   * has downloaded the episode. The entity carries that id rather than a
   * built URL: a credentialled URL is not safe to persist, and rebuilding one
   * later — for a resume shelf, an offline retry, a lock-screen handoff —
   * needs the id anyway.
   */
  streamId?: string;
  discNumber?: number;
  trackNumber?: number;
  year?: number;
  genres: string[];
  /** When this arrived in the library, unix ms. Server-originated records only. */
  addedAt?: number;
  audio?: AudioProperties;
}
