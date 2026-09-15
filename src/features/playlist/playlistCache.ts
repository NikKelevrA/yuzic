import type { PlaylistDetail } from '@/domain/entities/Detail';
import type { Song } from '@/domain/entities/Song';
import { entryIndex, movedOrder } from '@/providers/server/playlistEntries';

/**
 * The cached playlist, edited the way the server was just asked to edit it.
 *
 * The detail's `songs` and the playlist's `songIds` must stay in step, so every
 * edit rebuilds both from one list. Positions mean the same here as in
 * `PlaylistsApi`: a song can be in a playlist twice, and only the entry at
 * that position changes.
 */
function withSongs(detail: PlaylistDetail, songs: Song[]): PlaylistDetail {
  return {
    playlist: { ...detail.playlist, songIds: songs.map(song => song.localId), updatedAt: Date.now() },
    songs,
  };
}

/** A song the server appended — duplicates included, since servers keep them. */
export function withAppendedSong(detail: PlaylistDetail, song: Song): PlaylistDetail {
  return withSongs(detail, [...detail.songs, song]);
}

/** Without the entry the server removed. Unchanged if the cache no longer places it. */
export function withoutEntry(detail: PlaylistDetail, songId: string, position?: number): PlaylistDetail {
  const index = tryEntryIndex(detail, songId, position);
  if (index === -1) return detail;
  return withSongs(detail, detail.songs.filter((_, i) => i !== index));
}

/** With one entry moved. Unchanged if the cache no longer places it. */
export function withMovedEntry(detail: PlaylistDetail, songId: string, from: number, to: number): PlaylistDetail {
  const index = tryEntryIndex(detail, songId, from);
  if (index === -1) return detail;
  return withSongs(detail, movedOrder(detail.songs, index, to));
}

function tryEntryIndex(detail: PlaylistDetail, songId: string, position?: number): number {
  try {
    return entryIndex(detail.songs.map(song => song.nativeId), songId, position);
  } catch {
    return -1;
  }
}
