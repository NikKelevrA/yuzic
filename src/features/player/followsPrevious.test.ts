import { followsPreviousInQueue } from './followsPrevious';

describe('whether a queue item runs out of the one before it', () => {
  it('claims a segue between consecutive tracks of one album', () => {
    expect(followsPreviousInQueue(
      { albumId: 'album-1', discNumber: 1, trackNumber: 4 },
      { albumId: 'album-1', discNumber: 1, trackNumber: 5 }
    )).toBe(true);
  });

  it('does not claim one across a gap in the numbering', () => {
    // A queue built from an album with a track missing, or one sorted by
    // something other than track order: the join was never on the record.
    expect(followsPreviousInQueue(
      { albumId: 'album-1', discNumber: 1, trackNumber: 4 },
      { albumId: 'album-1', discNumber: 1, trackNumber: 7 }
    )).toBe(false);
  });

  it('does not claim one between different albums', () => {
    expect(followsPreviousInQueue(
      { albumId: 'album-1', discNumber: 1, trackNumber: 4 },
      { albumId: 'album-2', discNumber: 1, trackNumber: 5 }
    )).toBe(false);
  });

  it('does not claim one across a disc change', () => {
    expect(followsPreviousInQueue(
      { albumId: 'album-1', discNumber: 1, trackNumber: 4 },
      { albumId: 'album-1', discNumber: 2, trackNumber: 5 }
    )).toBe(false);
  });

  it('does not claim one when either album id is missing', () => {
    // Unknown is not a match: two unidentified tracks numbered 4 and 5 are not
    // evidence of anything, and treating them as a segue loses the crossfade.
    expect(followsPreviousInQueue(
      { discNumber: 1, trackNumber: 4 },
      { albumId: 'album-1', discNumber: 1, trackNumber: 5 }
    )).toBe(false);
    expect(followsPreviousInQueue(
      { albumId: 'album-1', discNumber: 1, trackNumber: 4 },
      { discNumber: 1, trackNumber: 5 }
    )).toBe(false);
  });

  it('does not claim one when either track number is missing', () => {
    expect(followsPreviousInQueue(
      { albumId: 'album-1', discNumber: 1 },
      { albumId: 'album-1', discNumber: 1, trackNumber: 5 }
    )).toBe(false);
  });

  it('treats two unreported disc numbers as the same disc', () => {
    // A single-disc release usually reports none at all, and demanding one
    // would switch the whole feature off for most of a library.
    expect(followsPreviousInQueue(
      { albumId: 'album-1', trackNumber: 4 },
      { albumId: 'album-1', trackNumber: 5 }
    )).toBe(true);
  });

  it('does not claim one when only one side reports a disc', () => {
    expect(followsPreviousInQueue(
      { albumId: 'album-1', trackNumber: 4 },
      { albumId: 'album-1', discNumber: 1, trackNumber: 5 }
    )).toBe(false);
  });

  it('answers for a missing neighbour rather than throwing', () => {
    // The first item in a queue has nothing in front of it, and the call site
    // reads it straight out of an array by index.
    expect(followsPreviousInQueue(undefined, { albumId: 'album-1', trackNumber: 1 })).toBe(false);
    expect(followsPreviousInQueue({}, {})).toBe(false);
  });
});
