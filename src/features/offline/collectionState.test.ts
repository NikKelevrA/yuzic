import {
  buildDownloadedTrackIdSet,
  getFullyDownloadedAlbumIds,
} from './collectionState';

describe('download collection state', () => {
  it('normalizes downloaded ids from current and legacy track shapes', () => {
    const ids = buildDownloadedTrackIdSet([
      { id: ' track-a ' },
      { trackId: 42 },
      { originalTrack: { id: 'track-c' } },
      { id: '' },
      {},
    ]);

    expect([...ids]).toEqual(['track-a', '42', 'track-c']);
  });


  it('detects fully downloaded albums without counting partial albums', () => {
    const albumIds = getFullyDownloadedAlbumIds(
      [
        { id: 'a1', albumId: 'album-a' },
        { id: 'a2', albumId: 'album-a' },
        { id: 'b1', albumId: 'album-b' },
        { id: 'b2', albumId: 'album-b' },
        { id: 'orphan' },
      ],
      new Set(['a1', 'a2', 'b1'])
    );

    expect([...albumIds]).toEqual(['album-a']);
  });
});
