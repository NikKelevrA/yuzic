import { coverNeighbours } from './coverNeighbours';
import type { CoverSource } from '@/domain/entities/Cover';
import type { Song } from '@/domain/entities/Song';
import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

const SERVER = serverProvenance('srv-1');

const cover = (nativeId: string): CoverSource => ({ kind: 'url', url: `https://art/${nativeId}` });

function makeSong(nativeId: string): Song {
  return {
    localId: makeLocalId('song', SERVER, nativeId),
    nativeId,
    provenance: SERVER,
    externalIds: {},
    libraryState: 'in-library',
    title: nativeId,
    artist: { localId: makeLocalId('artist', SERVER, 'ar1'), nativeId: 'ar1', externalIds: {}, name: 'Radiohead', cover: { kind: 'none' } },
    album: { localId: makeLocalId('album', SERVER, 'al1'), nativeId: 'al1', externalIds: {}, title: 'OK Computer', cover: { kind: 'none' } },
    cover: cover(nativeId),
    durationSeconds: 383,
    contentKind: 'song',
    genres: [],
  };
}

const queue = [makeSong('a'), makeSong('b'), makeSong('c')];

describe('coverNeighbours', () => {
  it('offers the artwork on either side of the playing track', () => {
    expect(coverNeighbours(queue, 1, 'off')).toEqual({
      previous: cover('a'),
      next: cover('c'),
    });
  });

  it('has nothing to show past either end of the queue', () => {
    expect(coverNeighbours(queue, 0, 'off').previous).toBeNull();
    expect(coverNeighbours(queue, 2, 'off').next).toBeNull();
  });

  it('follows the queue round when repeat-all says the swipe would', () => {
    // The move `canStartCoverSlide` allows from the last track, so the cover
    // that slides in is the one that starts playing.
    expect(coverNeighbours(queue, 2, 'all').next).toEqual(cover('a'));
  });

  it('shows no neighbours at all for an empty queue', () => {
    expect(coverNeighbours([], 0, 'off')).toEqual({ previous: null, next: null });
  });

  it('keeps an explicit skip available under repeat-one', () => {
    // Repeat-one repeats at the *end* of a track; an explicit skip still moves,
    // and `canStartCoverSlide` treats it like `off`.
    expect(coverNeighbours(queue, 1, 'one')).toEqual({
      previous: cover('a'),
      next: cover('c'),
    });
  });
});
