import type { CoverSource } from '@/domain/entities/Cover';
import type { LocalId } from '../identity/LocalId';
import type { EntityCore } from './EntityCore';

/**
 * One playlist.
 *
 * Playlists carry the same identity, provenance and library-state contract as
 * every other entity. They used to be the exception — no identity, no
 * provenance — which is why a generated playlist and a server playlist could
 * not be told apart once both were on screen.
 *
 * As with albums, songs are referenced rather than embedded.
 */
export interface Playlist extends EntityCore {
  title: string;
  cover: CoverSource;
  description?: string;
  /** Owned by the user on the origin, rather than shared or generated. */
  isOwned: boolean;
  /**
   * May change its songs and name. Absent means the same as `isOwned`; set
   * where a server shares playlists with edit rights, so one can be edited
   * without being owned. Deleting stays the owner's.
   */
  canEdit?: boolean;
  createdAt?: number;
  updatedAt?: number;
  /** Tracks that have been loaded, in playlist order, as references. */
  songIds: LocalId[];
  /**
   * How many tracks the playlist holds, as the origin reported it.
   *
   * `songIds` is only what has been *mapped*, and a listing endpoint maps no
   * tracks at all — so a playlist from `playlists.list` has an empty
   * `songIds` however many songs it really has. Every surface that drew a
   * count off the length said "0 songs" for every playlist on the screen.
   * The count travels separately because it is the one fact about the tracks
   * a listing does give us.
   */
  songCount?: number;
}

/**
 * How many songs a playlist has, for a surface that wants to say so.
 *
 * The origin's own count where it gave one, else what has been loaded — a
 * locally generated playlist has no count but does have its tracks.
 */
export function playlistSongCount(playlist: Playlist): number {
  return playlist.songCount ?? playlist.songIds.length;
}
