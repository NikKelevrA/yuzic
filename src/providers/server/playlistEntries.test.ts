import { PlaylistChangedError } from '@/providers/contracts/ServerAdapter';
import { entryIndex, movedOrder } from './playlistEntries';

describe('entryIndex', () => {
  it('takes the position when it still holds the song', () => {
    expect(entryIndex(['a', 'b', 'a'], 'a', 2)).toBe(2);
  });

  it("finds a song's only entry when the position moved", () => {
    expect(entryIndex(['b', 'a', 'c'], 'a', 0)).toBe(1);
    expect(entryIndex(['b', 'a', 'c'], 'a')).toBe(1);
  });

  it('refuses a song that is in the playlist twice without a position that matches', () => {
    expect(() => entryIndex(['a', 'b', 'a'], 'a')).toThrow(PlaylistChangedError);
    expect(() => entryIndex(['a', 'b', 'a'], 'a', 1)).toThrow(PlaylistChangedError);
  });

  it('refuses a song the playlist no longer has', () => {
    expect(() => entryIndex(['a'], 'z', 0)).toThrow(PlaylistChangedError);
  });
});

describe('movedOrder', () => {
  it('moves down and up', () => {
    expect(movedOrder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movedOrder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('clamps a target past either end', () => {
    expect(movedOrder(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(movedOrder(['a', 'b', 'c'], 2, -4)).toEqual(['c', 'a', 'b']);
  });
});
