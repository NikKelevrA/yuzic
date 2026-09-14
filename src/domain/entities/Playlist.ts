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
  createdAt?: number;
  updatedAt?: number;
  /** Tracks that have been loaded, in playlist order, as references. */
  songIds: LocalId[];
}
