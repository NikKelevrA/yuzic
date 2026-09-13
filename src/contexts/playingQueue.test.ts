import type { PlayableResource } from '@/features/playback/playableResource'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import {
  resourcesFromPlayerQueue,
  moveSongAfterCurrent,
  reconcileUnshuffledQueue,
  tagSegment,
  shiftSegmentsAfterInsert,
  shiftSegmentsAfterRemove,
  segmentAt,
  isContextBoundary,
  findNextBoundaryIndex,
  QueueSegment,
} from './playingQueue'

const song = (id: string) => ({ id })
const getId = (item: { id: string }) => item.id

describe('moveSongAfterCurrent', () => {
  it('inserts a new song directly after the current song', () => {
    const result = moveSongAfterCurrent(
      [song('a'), song('b'), song('c')],
      1,
      song('x'),
      getId,
    )

    expect(result?.queue.map(item => item.id)).toEqual(['a', 'b', 'x', 'c'])
    expect(result?.currentIndex).toBe(1)
    expect(result?.insertIndex).toBe(2)
    expect(result?.removedIndex).toBeNull()
  })

  it('moves an earlier queued song after current and adjusts the current index', () => {
    const result = moveSongAfterCurrent(
      [song('a'), song('b'), song('c'), song('d')],
      2,
      song('a'),
      getId,
    )

    expect(result?.queue.map(item => item.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(result?.currentIndex).toBe(1)
    expect(result?.insertIndex).toBe(2)
    expect(result?.removedIndex).toBe(0)
  })

  it('moves a later queued song after current without shifting current', () => {
    const result = moveSongAfterCurrent(
      [song('a'), song('b'), song('c'), song('d')],
      1,
      song('d'),
      getId,
    )

    expect(result?.queue.map(item => item.id)).toEqual(['a', 'b', 'd', 'c'])
    expect(result?.currentIndex).toBe(1)
    expect(result?.insertIndex).toBe(2)
    expect(result?.removedIndex).toBe(3)
  })

  it('does nothing when asked to play the current song next', () => {
    const result = moveSongAfterCurrent(
      [song('a'), song('b'), song('c')],
      1,
      song('b'),
      getId,
    )

    expect(result).toBeNull()
  })
})

describe('reconcileUnshuffledQueue', () => {
  it('restores the original order unchanged when nothing was added or removed', () => {
    const result = reconcileUnshuffledQueue(
      [song('a'), song('b'), song('c')],
      [song('c'), song('a'), song('b')],
      getId,
    )

    expect(result.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('appends a song added to the live queue while shuffled instead of dropping it', () => {
    // Regression: addToQueue/playNext/etc. only mutate the live shuffled
    // queue, never the pre-shuffle snapshot — restoring the snapshot as-is
    // used to silently drop anything added during shuffle playback.
    const result = reconcileUnshuffledQueue(
      [song('a'), song('b'), song('c')],
      [song('b'), song('a'), song('x'), song('c')],
      getId,
    )

    expect(result.map(item => item.id)).toEqual(['a', 'b', 'c', 'x'])
  })

  it('does not resurrect a song removed from the live queue while shuffled', () => {
    const result = reconcileUnshuffledQueue(
      [song('a'), song('b'), song('c')],
      [song('c'), song('a')],
      getId,
    )

    expect(result.map(item => item.id)).toEqual(['a', 'c'])
  })
})

describe('queue segment tracking', () => {
  const albumSegment = (length: number, id = 'album-1'): QueueSegment[] => [
    { startIndex: 0, length, source: { kind: 'user', contextId: id, contextType: 'album' } },
  ]

  it('tagSegment appends a new segment and ignores non-positive lengths', () => {
    const base = albumSegment(3)
    const tagged = tagSegment(base, 3, 2, { kind: 'autoplay-fill', contextId: 'fill-1' })

    expect(tagged).toHaveLength(2)
    expect(tagged[1]).toEqual({ startIndex: 3, length: 2, source: { kind: 'autoplay-fill', contextId: 'fill-1' } })
    expect(tagSegment(base, 3, 0, { kind: 'autoplay-fill', contextId: 'fill-2' })).toBe(base)
  })

  it('shiftSegmentsAfterInsert moves later segments right, leaves earlier ones untouched', () => {
    const segments: QueueSegment[] = [
      { startIndex: 0, length: 2, source: { kind: 'user', contextId: 'a', contextType: 'album' } },
      { startIndex: 2, length: 2, source: { kind: 'user', contextId: 'b', contextType: 'playlist' } },
    ]

    const shifted = shiftSegmentsAfterInsert(segments, 2, 1)

    expect(shifted[0].startIndex).toBe(0)
    expect(shifted[1].startIndex).toBe(3)
  })

  it('shiftSegmentsAfterRemove moves later segments left and drops emptied ones', () => {
    const segments: QueueSegment[] = [
      { startIndex: 0, length: 2, source: { kind: 'user', contextId: 'a', contextType: 'album' } },
      { startIndex: 2, length: 1, source: { kind: 'autoplay-fill', contextId: 'fill-1' } },
      { startIndex: 3, length: 2, source: { kind: 'user', contextId: 'b', contextType: 'playlist' } },
    ]

    const shifted = shiftSegmentsAfterRemove(segments, 2, 1)

    expect(shifted).toHaveLength(2)
    expect(shifted[0].startIndex).toBe(0)
    expect(shifted[1].startIndex).toBe(2)
  })

  it('segmentAt finds the segment containing an index', () => {
    const segments = [
      ...albumSegment(2, 'album-1'),
      { startIndex: 2, length: 2, source: { kind: 'user' as const, contextId: 'album-2', contextType: 'album' as const } },
    ]

    expect(segmentAt(segments, 1)?.source).toMatchObject({ contextId: 'album-1' })
    expect(segmentAt(segments, 2)?.source).toMatchObject({ contextId: 'album-2' })
    expect(segmentAt(segments, 99)).toBeUndefined()
  })

  it('isContextBoundary is true only where adjacent segments differ', () => {
    const segments = [
      { startIndex: 0, length: 2, source: { kind: 'user' as const, contextId: 'album-1', contextType: 'album' as const } },
      { startIndex: 2, length: 2, source: { kind: 'user' as const, contextId: 'album-2', contextType: 'album' as const } },
    ]

    expect(isContextBoundary(segments, 0)).toBe(false) // index 0 has no predecessor
    expect(isContextBoundary(segments, 1)).toBe(false) // still within album-1
    expect(isContextBoundary(segments, 2)).toBe(true)  // album-1 -> album-2
    expect(isContextBoundary(segments, 3)).toBe(false) // still within album-2
  })

  it('findNextBoundaryIndex returns the nearest boundary at or after fromIndex, or null', () => {
    const segments = [
      { startIndex: 0, length: 2, source: { kind: 'user' as const, contextId: 'album-1', contextType: 'album' as const } },
      { startIndex: 2, length: 2, source: { kind: 'user' as const, contextId: 'album-2', contextType: 'album' as const } },
    ]

    expect(findNextBoundaryIndex(segments, 0)).toBe(2)
    expect(findNextBoundaryIndex(segments, 2)).toBe(2)
    expect(findNextBoundaryIndex(segments, 3)).toBeNull()
  })
})

describe('resourcesFromPlayerQueue', () => {
  const provenance = serverProvenance('srv-1');

  const resourceFor = (nativeId: string, streamUrl: string): PlayableResource => ({
    song: {
      localId: makeLocalId('song', provenance, nativeId),
      nativeId,
      provenance,
      externalIds: {},
      libraryState: 'in-library',
      title: `Track ${nativeId}`,
      artist: {
        localId: makeLocalId('artist', provenance, 'a1'),
        nativeId: 'a1',
        externalIds: {},
        name: 'Artist',
        cover: { kind: 'none' },
      },
      album: {
        localId: makeLocalId('album', provenance, 'al1'),
        nativeId: 'al1',
        externalIds: {},
        title: 'Album',
        cover: { kind: 'none' },
      },
      cover: { kind: 'none' },
      durationSeconds: 100,
      contentKind: 'song',
      genres: [],
    },
    streamUrl,
  });

  const playerItem = (nativeId: string) => ({
    mediaId: makeLocalId('song', provenance, nativeId),
    title: `Track ${nativeId}`,
    url: `https://server.test/stream/${nativeId}`,
  });

  it('takes order from the player, not from what the app last thought', () => {
    // The engine applied the move; the app's own splice arithmetic is the
    // thing being replaced here, so it does not get a vote.
    const inMemory = [resourceFor('1', 'u1'), resourceFor('2', 'u2'), resourceFor('3', 'u3')];

    const next = resourcesFromPlayerQueue(
      [playerItem('3'), playerItem('1'), playerItem('2')],
      inMemory,
      new Map()
    );

    expect(next.map(r => r.song.nativeId)).toEqual(['3', '1', '2']);
  });

  it('prefers the in-memory resource, whose stream URL is the fresher one', () => {
    // A stream URL carries a token that goes stale. Rebuilding from the
    // player's item would hand back the URL it was given when the queue was
    // set, which is exactly the one that expires.
    const fresh = resourceFor('1', 'https://server.test/stream/1?token=fresh');

    const next = resourcesFromPlayerQueue([playerItem('1')], [fresh], new Map());

    expect(next[0]).toBe(fresh);
  });

  it('falls back to the library when the queue has lost the track', () => {
    const known = resourceFor('1', 'https://server.test/stream/1');
    const library = new Map([[known.song.localId, known]]);

    const next = resourcesFromPlayerQueue([playerItem('1')], [], library);

    expect(next[0]).toBe(known);
  });

  it('rebuilds from the player item when nothing else knows the track', () => {
    // Reachable after a restore into a fresh JavaScript context: the player
    // still holds the queue and the app holds nothing, and the media id is
    // enough to recover provenance and the origin's own id.
    const next = resourcesFromPlayerQueue([playerItem('1')], [], new Map());

    expect(next).toHaveLength(1);
    expect(next[0].song.nativeId).toBe('1');
    expect(next[0].song.provenance).toEqual(provenance);
  });

  it('drops only what cannot be identified at all', () => {
    const known = resourceFor('1', 'u1');

    const next = resourcesFromPlayerQueue(
      [playerItem('1'), { url: '', title: 'nothing' }],
      [known],
      new Map()
    );

    expect(next.map(r => r.song.nativeId)).toEqual(['1']);
  });
});
