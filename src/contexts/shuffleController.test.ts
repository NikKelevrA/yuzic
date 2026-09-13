import type { PlayerBackend } from '@/features/player/backend';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import type { ShuffleMode } from '@/domain/playback/PlaybackModes';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { QueueSegment } from './playingQueue';
import { createShuffleController, type ShuffleControllerDeps } from './shuffleController';

jest.mock('@/utils/shuffleArray', () => ({
  // Reversed, so a test can tell "was shuffled" from "was left alone" without
  // pinning a random order.
  __esModule: true,
  default: <T,>(items: T[]) => [...items].reverse(),
}));

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

const of = (nativeIds: string[]) => nativeIds.map(resource);

function harness(over: Partial<{
  queue: PlayableResource[];
  currentIndex: number;
  mode: ShuffleMode;
  originalQueue: PlayableResource[] | null;
  isPlaying: boolean;
  position: number;
  onInject: () => void;
}> = {}) {
  let queue = over.queue ?? of(['1', '2', '3', '4']);
  let currentIndex = over.currentIndex ?? 0;
  let mode: ShuffleMode = over.mode ?? 'off';
  let originalQueue = over.originalQueue ?? null;
  let segments: QueueSegment[] = [];
  const loaded: { ids: string[]; startIndex: number; play: boolean; seek: number }[] = [];
  const injected: { wasPlaying: boolean; savedPosition: number }[] = [];

  const backend = {
    getProgress: () => ({ position: over.position ?? 0, duration: 200, buffered: 0 }),
  } as unknown as PlayerBackend;

  const deps: ShuffleControllerDeps = {
    backend: () => backend,
    queue: () => queue,
    setQueue: next => { queue = next; },
    setSegments: next => { segments = next; },
    currentIndex: () => currentIndex,
    setCurrentIndex: index => { currentIndex = index; },
    currentResource: () => queue[currentIndex] ?? null,
    shuffleMode: () => mode,
    setShuffleMode: next => { mode = next; },
    originalQueue: () => originalQueue,
    setOriginalQueue: next => { originalQueue = next; },
    isPlaying: () => over.isPlaying ?? true,
    bumpQueue: () => {},
    loadQueue: async (resources, startIndex, play, seekToPosition) => {
      loaded.push({
        ids: resources.map(r => r.song.nativeId),
        startIndex,
        play,
        seek: seekToPosition,
      });
    },
    injectSmartShuffleTracks: async (wasPlaying, savedPosition) => {
      injected.push({ wasPlaying, savedPosition });
      over.onInject?.();
    },
  };

  return {
    controller: createShuffleController(deps),
    loaded,
    injected,
    get queue() { return queue; },
    get currentIndex() { return currentIndex; },
    get mode() { return mode; },
    get originalQueue() { return originalQueue; },
    get segments() { return segments; },
  };
}

const ids = (queue: PlayableResource[]) => queue.map(r => r.song.nativeId);

describe('off -> shuffle', () => {
  it('keeps the playing track at the front so the music does not jump', async () => {
    // Shuffling the current track along with the rest would cut it off
    // mid-play to start something else.
    const h = harness({ currentIndex: 1 });

    await h.controller.cycleShuffleMode();

    expect(ids(h.queue)[0]).toBe('2');
    expect(h.currentIndex).toBe(0);
    expect(h.mode).toBe('shuffle');
  });

  it('shuffles everything else', async () => {
    const h = harness({ currentIndex: 0 });

    await h.controller.cycleShuffleMode();

    expect(ids(h.queue)).toEqual(['1', '4', '3', '2']);
  });

  it('snapshots the order to go back to', async () => {
    const h = harness({ currentIndex: 0 });

    await h.controller.cycleShuffleMode();

    expect(ids(h.originalQueue ?? [])).toEqual(['1', '2', '3', '4']);
  });

  it('resumes exactly where playback was', async () => {
    const h = harness({ position: 73.5, isPlaying: true });

    await h.controller.cycleShuffleMode();

    expect(h.loaded[0]).toMatchObject({ startIndex: 0, play: true, seek: 73.5 });
  });

  it('stays paused if it was paused', async () => {
    const h = harness({ isPlaying: false });

    await h.controller.cycleShuffleMode();

    expect(h.loaded[0].play).toBe(false);
  });
});

describe('shuffle -> smart', () => {
  it('injects related tracks and keeps the shuffled order', async () => {
    const h = harness({ mode: 'shuffle', queue: of(['3', '1', '2']), position: 12 });

    await h.controller.cycleShuffleMode();

    expect(h.mode).toBe('smart');
    expect(h.injected).toEqual([{ wasPlaying: true, savedPosition: 12 }]);
    expect(h.loaded).toEqual([]);
  });

  it('leaves the snapshot alone, so turning shuffle off still restores it', async () => {
    // The point of not re-snapshotting: from 'smart', off must go back to what
    // the listener chose, not to the shuffled order.
    const original = of(['1', '2', '3']);
    const h = harness({ mode: 'shuffle', queue: of(['3', '1', '2']), originalQueue: original });

    await h.controller.cycleShuffleMode();

    expect(h.originalQueue).toBe(original);
  });
});

describe('smart -> off', () => {
  it('puts the original order back', async () => {
    const h = harness({
      mode: 'smart',
      queue: of(['3', '1', '2']),
      originalQueue: of(['1', '2', '3']),
    });

    await h.controller.cycleShuffleMode();

    expect(ids(h.queue)).toEqual(['1', '2', '3']);
    expect(h.mode).toBe('off');
    expect(h.originalQueue).toBeNull();
  });

  it('keeps tracks added while shuffled', async () => {
    // Queue edits only ever touched the live queue, never the snapshot.
    // Restoring the snapshot verbatim would silently lose them.
    const h = harness({
      mode: 'smart',
      queue: of(['3', '1', '99', '2']),
      originalQueue: of(['1', '2', '3']),
    });

    await h.controller.cycleShuffleMode();

    expect(ids(h.queue)).toContain('99');
  });

  it('does not resurrect a track removed while shuffled', async () => {
    // A track dropped because it could not be played must stay dropped.
    const h = harness({
      mode: 'smart',
      queue: of(['3', '1']),
      originalQueue: of(['1', '2', '3']),
      currentIndex: 0,
    });

    await h.controller.cycleShuffleMode();

    expect(ids(h.queue)).not.toContain('2');
  });

  it('follows the track being heard rather than the index', async () => {
    const h = harness({
      mode: 'smart',
      queue: of(['3', '1', '2']),
      currentIndex: 0,
      originalQueue: of(['1', '2', '3']),
    });

    await h.controller.cycleShuffleMode();

    expect(ids(h.queue)[h.currentIndex]).toBe('3');
    expect(h.loaded[0].startIndex).toBe(h.currentIndex);
  });

  it('only changes the label when there is no snapshot to restore', async () => {
    // Reached by a restored session, or a selection played with shuffle on
    // from the start: there is no original order to go back to.
    const h = harness({ mode: 'smart', queue: of(['3', '1', '2']), originalQueue: null });

    await h.controller.cycleShuffleMode();

    expect(h.mode).toBe('off');
    expect(ids(h.queue)).toEqual(['3', '1', '2']);
    expect(h.loaded).toEqual([]);
  });
});

describe('tapping faster than the queue reloads', () => {
  it('ignores a second tap while a cycle is still running', async () => {
    // Two of the three steps reload the whole queue, which is slow enough for
    // a second tap to land inside the first — and interleaved, the mode ends
    // up somewhere neither tap asked for.
    const h = harness();

    await Promise.all([
      h.controller.cycleShuffleMode(),
      h.controller.cycleShuffleMode(),
    ]);

    expect(h.mode).toBe('shuffle');
    expect(h.loaded).toHaveLength(1);
  });

  it('accepts the next tap once the cycle has finished', async () => {
    const h = harness();

    await h.controller.cycleShuffleMode();
    await h.controller.cycleShuffleMode();

    expect(h.mode).toBe('smart');
  });
});
