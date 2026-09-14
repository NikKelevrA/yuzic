import type { PlayerBackend } from '@/features/player/backend';
import type { MediaItem } from '@/features/player/mediaItem';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { QueueSegment } from './playingQueue';
import { segmentAt } from './playingQueue';
import { createQueueController, type QueueControllerDeps } from './queueController';

const provenance = serverProvenance('srv-1');

function song(nativeId: string): Song {
  return {
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
    durationSeconds: 200,
    contentKind: 'song',
    genres: [],
  };
}

const resource = (nativeId: string): PlayableResource => ({
  song: song(nativeId),
  streamUrl: `https://server.test/stream/${nativeId}`,
});

function harness(over: Partial<{
  queue: PlayableResource[];
  segments: QueueSegment[];
  currentIndex: number;
  unplayable: boolean;
}> = {}) {
  let queue = over.queue ?? [resource('1'), resource('2'), resource('3')];
  let segments = over.segments ?? [];
  let currentIndex = over.currentIndex ?? 0;
  let bumps = 0;
  const engineCalls: { name: string; args: unknown[] }[] = [];

  const backend = {
    moveMediaItem: (from: number, to: number) => {
      engineCalls.push({ name: 'moveMediaItem', args: [from, to] });
    },
    addMediaItems: (items: MediaItem[]) => {
      engineCalls.push({ name: 'addMediaItems', args: [items.map(i => i.mediaId)] });
    },
    insertMediaItem: (index: number, item: MediaItem) => {
      engineCalls.push({ name: 'insertMediaItem', args: [index, item.mediaId] });
    },
  } as unknown as PlayerBackend;

  const deps: QueueControllerDeps = {
    backend: () => backend,
    queue: () => queue,
    setQueue: next => { queue = next; },
    segments: () => segments,
    setSegments: next => { segments = next; },
    currentIndex: () => currentIndex,
    setCurrentIndex: index => { currentIndex = index; },
    currentResource: () => queue[currentIndex] ?? null,
    resolvePlayableSong: s => (over.unplayable ? null : { song: s, streamUrl: `https://server.test/stream/${s.nativeId}` }),
    buildItem: r => ({ mediaId: r.song.localId, url: r.streamUrl }),
    bumpQueue: () => { bumps += 1; },
  };

  return {
    controller: createQueueController(deps),
    engineCalls,
    get queue() { return queue; },
    get segments() { return segments; },
    get currentIndex() { return currentIndex; },
    get bumps() { return bumps; },
  };
}

const ids = (queue: PlayableResource[]) => queue.map(r => r.song.nativeId);

describe('moveTrack', () => {
  it('reorders the queue and tells the player the same move', () => {
    const h = harness();

    h.controller.moveTrack(0, 2);

    expect(ids(h.queue)).toEqual(['2', '3', '1']);
    expect(h.engineCalls).toEqual([{ name: 'moveMediaItem', args: [0, 2] }]);
  });

  it('keeps the active index on the track that is playing, not on the number', () => {
    // Dragging the playing track to the end means the listener is now at
    // index 2 and still hearing the same song. Leaving the index where it was
    // would silently change what is "current" to whatever slid into its place.
    const h = harness({ currentIndex: 0 });

    h.controller.moveTrack(0, 2);

    expect(h.currentIndex).toBe(2);
  });

  it('follows the playing track when something is moved past it', () => {
    const h = harness({ currentIndex: 1 });

    h.controller.moveTrack(0, 2);

    expect(h.currentIndex).toBe(0);
    expect(ids(h.queue)[0]).toBe('2');
  });

  it('does nothing at all when the track did not move', () => {
    const h = harness();

    h.controller.moveTrack(1, 1);

    expect(h.engineCalls).toEqual([]);
    expect(h.bumps).toBe(0);
  });
});

describe('addToQueue', () => {
  it('appends to both the queue and the player', () => {
    const h = harness();

    h.controller.addToQueue(song('4'));

    expect(ids(h.queue)).toEqual(['1', '2', '3', '4']);
    expect(h.engineCalls).toEqual([
      { name: 'addMediaItems', args: [[makeLocalId('song', provenance, '4')]] },
    ]);
  });

  it('marks the added track as one the listener queued by hand', () => {
    // The segment map is what "play the rest of this album" reads. A track
    // added by hand is not part of whatever album it landed after.
    const h = harness();

    h.controller.addToQueue(song('4'));

    expect(segmentAt(h.segments, 3)?.source).toMatchObject({ kind: 'user', contextType: 'adhoc' });
  });

  it('ignores a track already in the queue rather than adding a second copy', () => {
    const h = harness();

    h.controller.addToQueue(song('2'));

    expect(ids(h.queue)).toEqual(['1', '2', '3']);
    expect(h.engineCalls).toEqual([]);
  });

  it('throws for a track with no playable URL rather than doing nothing', () => {
    // Reached from a menu the listener tapped; silently not changing a queue
    // they just asked to change is the worst available outcome.
    const h = harness({ unplayable: true });

    expect(() => h.controller.addToQueue(song('4'))).toThrow(/no playable media URL/);
  });
});

describe('playNext', () => {
  it('inserts a new track directly after the one playing', () => {
    const h = harness({ currentIndex: 0 });

    h.controller.playNext(song('9'));

    expect(ids(h.queue)).toEqual(['1', '9', '2', '3']);
    expect(h.engineCalls).toEqual([
      { name: 'insertMediaItem', args: [1, makeLocalId('song', provenance, '9')] },
    ]);
  });

  it('moves a track already in the queue instead of duplicating it', () => {
    const h = harness({ currentIndex: 0 });

    h.controller.playNext(song('3'));

    expect(ids(h.queue)).toEqual(['1', '3', '2']);
    expect(h.engineCalls).toEqual([{ name: 'moveMediaItem', args: [2, 1] }]);
  });

  it('shifts the segments after the insert point before tagging the new one', () => {
    // Tagging first would write the new segment at the insert point and then
    // shift it along with everything after it, leaving the track the listener
    // queued marked as part of whatever album followed. Asserted on the
    // segments themselves rather than through `segmentAt`, which resolves an
    // index to the *first* covering segment — see the overlap case below.
    const h = harness({
      currentIndex: 0,
      segments: [
        { startIndex: 0, length: 1, source: { kind: 'user', contextId: 'al1', contextType: 'album' } },
        { startIndex: 1, length: 2, source: { kind: 'user', contextId: 'al2', contextType: 'album' } },
      ] as QueueSegment[],
    });

    h.controller.playNext(song('9'));

    expect(h.segments).toEqual([
      { startIndex: 0, length: 1, source: { kind: 'user', contextId: 'al1', contextType: 'album' } },
      { startIndex: 2, length: 2, source: { kind: 'user', contextId: 'al2', contextType: 'album' } },
      { startIndex: 1, length: 1, source: expect.objectContaining({ contextType: 'adhoc' }) },
    ]);
  });

  it('does not mark a hand-queued track as part of the album it landed in', () => {
    // The whole reason "play next" touches the segment map: it inserts into
    // the middle of whatever album is playing. The album segment used to go on
    // claiming the same three slots, which after the insert were a different
    // three — so this track read as part of the album, and the album's last
    // track read as outside it.
    const h = harness({
      currentIndex: 0,
      segments: [
        { startIndex: 0, length: 3, source: { kind: 'user', contextId: 'al1', contextType: 'album' } },
      ] as QueueSegment[],
    });

    h.controller.playNext(song('9'));

    expect(segmentAt(h.segments, 1)?.source).toMatchObject({ contextType: 'adhoc' });
    expect(segmentAt(h.segments, 0)?.source).toMatchObject({ contextId: 'al1' });
    expect(segmentAt(h.segments, 2)?.source).toMatchObject({ contextId: 'al1' });
    expect(segmentAt(h.segments, 3)?.source).toMatchObject({ contextId: 'al1' });
  });

  it('leaves the segments alone when the track was only moved', () => {
    // Nothing was added, so the track keeps whatever context it was queued
    // under — inventing an adhoc segment here would split the album it is
    // part of.
    const h = harness({
      currentIndex: 0,
      segments: [{ startIndex: 0, length: 3, source: { kind: 'user', contextId: 'al1', contextType: 'album' } }] as QueueSegment[],
    });
    const before = h.segments;

    h.controller.playNext(song('3'));

    expect(h.segments).toBe(before);
  });

  it('does nothing when there is no current track to be next after', () => {
    const h = harness({ queue: [], currentIndex: 0 });

    h.controller.playNext(song('9'));

    expect(h.queue).toEqual([]);
    expect(h.engineCalls).toEqual([]);
  });
});
