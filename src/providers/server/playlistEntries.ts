import { PlaylistChangedError } from '@/providers/contracts/ServerAdapter';

/**
 * Which entry of a playlist an edit means.
 *
 * Servers address playlist entries by position (Subsonic), by an entry id
 * (Jellyfin, Plex) or by index into a local array — never by song id alone,
 * because a playlist may hold the same song twice. The screen knows the
 * position it showed; the song id checks that position still holds that song.
 *
 * `songIds` are the server's own ids, in playlist order.
 */
export function entryIndex(songIds: readonly string[], songId: string, position?: number): number {
  if (position !== undefined && songIds[position] === songId) return position;
  const first = songIds.indexOf(songId);
  if (first === -1) throw new PlaylistChangedError('The song is no longer in this playlist');
  // Without a position that still matches, only an unambiguous song is safe to edit.
  if (songIds.indexOf(songId, first + 1) !== -1) throw new PlaylistChangedError();
  return first;
}

/** `items` with the entry at `from` moved to `to`, clamped into the list. */
export function movedOrder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}
