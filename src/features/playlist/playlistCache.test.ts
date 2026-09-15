import type { PlaylistDetail } from '@/domain/entities/Detail';
import type { Song } from '@/domain/entities/Song';
import { withAppendedSong, withMovedEntry, withoutEntry } from './playlistCache';

const song = (nativeId: string) => ({ nativeId, localId: `song:srv:${nativeId}` }) as unknown as Song;

function detail(...ids: string[]): PlaylistDetail {
  const songs = ids.map(song);
  return {
    playlist: { nativeId: 'p1', songIds: songs.map(s => s.localId) },
    songs,
  } as unknown as PlaylistDetail;
}

const order = (d: PlaylistDetail) => d.songs.map(s => s.nativeId);

describe('playlist cache edits', () => {
  it('removes only the entry at the position, not every copy of the song', () => {
    const next = withoutEntry(detail('a', 'b', 'a'), 'a', 2);

    expect(order(next)).toEqual(['a', 'b']);
    expect(next.playlist.songIds).toEqual(next.songs.map(s => s.localId));
  });

  it('leaves the cache alone when it cannot tell which copy was meant', () => {
    const before = detail('a', 'b', 'a');

    expect(withoutEntry(before, 'a')).toBe(before);
  });

  it('appends a song that is already there, as the server does', () => {
    expect(order(withAppendedSong(detail('a', 'b'), song('a')))).toEqual(['a', 'b', 'a']);
  });

  it('moves one entry and keeps the playlist ids in step', () => {
    const next = withMovedEntry(detail('a', 'b', 'c'), 'a', 0, 2);

    expect(order(next)).toEqual(['b', 'c', 'a']);
    expect(next.playlist.songIds).toEqual(['song:srv:b', 'song:srv:c', 'song:srv:a']);
  });
});
