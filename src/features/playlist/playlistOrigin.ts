/**
 * Where a playlist actually came from, as one typed decision — the playlist
 * counterpart to `album/trackPlayability.ts`'s per-track decision.
 *
 * `Playlist` carries the same identity/provenance/library-state contract as
 * every other entity now (`domain/entities/Playlist.ts`), which is what
 * makes this answerable at all: before, a playlist generated in-app (e.g. an
 * AudioMuse "Similar to X" mix, once created, is a normal server playlist —
 * `isOwned: true`, `provenance.origin: 'server'`) and one that arrived from
 * an outside catalogue were the same shapeless object once both were on
 * screen. This turns the entity's own fields into the single place a screen
 * asks "where did this come from" instead of guessing from a title prefix or
 * other inference.
 */
import type { Playlist } from '@/domain/entities/Playlist';

export type PlaylistOrigin =
  /** The user's own playlist on the active server or local library. */
  | { kind: 'owned' }
  /** Visible on the active server, but not created by this user (a shared
   *  or public playlist another account owns). */
  | { kind: 'shared' }
  /** Not from the active server at all — an outside catalogue/integration. */
  | { kind: 'external'; providerId: string };

export function resolvePlaylistOrigin(playlist: Playlist): PlaylistOrigin {
  if (playlist.provenance.origin === 'integration') {
    return { kind: 'external', providerId: playlist.provenance.providerId };
  }
  return playlist.isOwned ? { kind: 'owned' } : { kind: 'shared' };
}
