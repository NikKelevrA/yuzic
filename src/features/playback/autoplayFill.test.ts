import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import {
  FILL_BATCH_SIZE,
  LOW_WATERMARK,
  RECENT_CONTEXT_SIZE,
  buildFillRequest,
  remainingAfterCurrent,
  shouldFillQueue,
} from './autoplayFill';

const provenance = serverProvenance('srv-1');

function resource(nativeId: string): PlayableResource {
  const localId = makeLocalId('song', provenance, nativeId);
  const song = {
    localId,
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: `track-${nativeId}`,
    artist: { localId: makeLocalId('artist', provenance, 'a'), nativeId: 'a', externalIds: {}, name: 'A', cover: { kind: 'none' } },
    album: { localId: makeLocalId('album', provenance, 'al'), nativeId: 'al', externalIds: {}, title: 'Al', cover: { kind: 'none' } },
    cover: { kind: 'none' },
    durationSeconds: 100,
    contentKind: 'song',
    genres: [],
  } as Song;
  return { song, streamUrl: `https://server.test/${nativeId}` };
}

function queue(size: number): PlayableResource[] {
  return Array.from({ length: size }, (_, i) => resource(String(i)));
}

const enabled = { autoplayEnabled: true, isFilling: false };

describe('remainingAfterCurrent', () => {
  it('counts the tracks left after the current one', () => {
    expect(remainingAfterCurrent(10, 0)).toBe(9);
    expect(remainingAfterCurrent(10, 9)).toBe(0);
  });

  it('never goes negative on an index past the end', () => {
    // A stale index must not read as "plenty of runway left".
    expect(remainingAfterCurrent(3, 7)).toBe(0);
  });

  it('reports nothing left for an empty queue', () => {
    expect(remainingAfterCurrent(0, 0)).toBe(0);
  });
});

describe('shouldFillQueue', () => {
  it('fills once runway reaches the watermark', () => {
    expect(shouldFillQueue({ queueLength: 10, currentIndex: 6, ...enabled })).toBe(true);
  });

  it('holds off while there is more runway than the watermark', () => {
    expect(shouldFillQueue({ queueLength: 10, currentIndex: 5, ...enabled })).toBe(false);
  });

  it('fills at the end of the queue', () => {
    expect(shouldFillQueue({ queueLength: 10, currentIndex: 9, ...enabled })).toBe(true);
  });

  it('does nothing when autoplay is off', () => {
    expect(
      shouldFillQueue({ queueLength: 10, currentIndex: 9, autoplayEnabled: false, isFilling: false })
    ).toBe(false);
  });

  it('does not start a second fill while one is in flight', () => {
    // A concurrent fill would append the same batch twice.
    expect(
      shouldFillQueue({ queueLength: 10, currentIndex: 9, autoplayEnabled: true, isFilling: true })
    ).toBe(false);
  });

  it('fills on a stale index past the end rather than stalling', () => {
    expect(shouldFillQueue({ queueLength: 3, currentIndex: 7, ...enabled })).toBe(true);
  });

  it('sits exactly on the documented watermark', () => {
    const atWatermark = { queueLength: 10, currentIndex: 10 - 1 - LOW_WATERMARK, ...enabled };
    const justAbove = { queueLength: 10, currentIndex: 10 - 2 - LOW_WATERMARK, ...enabled };

    expect(shouldFillQueue(atWatermark)).toBe(true);
    expect(shouldFillQueue(justAbove)).toBe(false);
  });
});

describe('buildFillRequest', () => {
  it('sends the current track and the recent ones as context', () => {
    const request = buildFillRequest(queue(20), 10);

    expect(request.recentResources.map(r => r.song.nativeId)).toEqual(
      ['5', '6', '7', '8', '9', '10'],
    );
  });

  it('includes the current track in the context', () => {
    const request = buildFillRequest(queue(20), 10);

    expect(request.recentResources[request.recentResources.length - 1].song.nativeId).toBe('10');
  });

  it('caps the context window', () => {
    expect(buildFillRequest(queue(50), 40).recentResources).toHaveLength(RECENT_CONTEXT_SIZE + 1);
  });

  it('does not run off the start of the queue', () => {
    const request = buildFillRequest(queue(20), 2);

    expect(request.recentResources.map(r => r.song.nativeId)).toEqual(['0', '1', '2']);
  });

  it('excludes everything already queued so a fill cannot duplicate it', () => {
    const q = queue(4);
    const request = buildFillRequest(q, 1);

    expect(request.excludeIds).toEqual(new Set(q.map(r => r.song.localId)));
  });

  it('excludes tracks ahead of the current one, not just played ones', () => {
    // The queue's tail is what a fill would otherwise re-add.
    const q = queue(10);
    expect(buildFillRequest(q, 0).excludeIds.has(q[9].song.localId)).toBe(true);
  });

  it('requests the default batch size', () => {
    expect(buildFillRequest(queue(10), 0).count).toBe(FILL_BATCH_SIZE);
  });

  it('honours an explicit batch size', () => {
    expect(buildFillRequest(queue(10), 0, 3).count).toBe(3);
  });

  it('handles an empty queue without throwing', () => {
    const request = buildFillRequest([], 0);

    expect(request.recentResources).toEqual([]);
    expect(request.excludeIds.size).toBe(0);
  });
});
