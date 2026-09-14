import type { Song } from '@/domain/entities/Song';
import type { RepeatModeState, ShuffleMode } from '@/domain/playback/PlaybackModes';
import type { PlayableResource } from './playableResource';
import type { QueueSegment } from './playingQueue';

/** What the screen draws from the session. A new object only when one of these changes. */
export type PlaybackSnapshot = {
  currentSong: Song | null;
  currentIndex: number;
  isBuffering: boolean;
  repeatMode: RepeatModeState;
  shuffleMode: ShuffleMode;
  playbackSpeed: number;
  volume: number;
  /** Bumps on every queue edit; the queue itself is too large to compare. */
  queueVersion: number;
};

const INITIAL_SNAPSHOT: PlaybackSnapshot = {
  currentSong: null,
  currentIndex: 0,
  isBuffering: false,
  repeatMode: 'off',
  shuffleMode: 'off',
  playbackSpeed: 1,
  volume: 1,
  queueVersion: 0,
};

export type PlaybackSession = ReturnType<typeof createPlaybackSession>;

/**
 * The one owner of what is playing: the queue and its segments, the shuffle
 * snapshot, where the pointer is, and the modes.
 *
 * Every controller reads and writes these facts at the moment it acts, and
 * the screen draws them. They used to be kept twice — React state for the
 * screen and a ref mirroring each piece for the controllers — with every
 * write having to remember to update both. Here a write is one call, the
 * controllers read the value it wrote, and React subscribes to the snapshot.
 *
 * Plain functions, not a class: controllers take these as their getters and
 * setters directly, so nothing depends on `this`.
 */
export function createPlaybackSession() {
  let queue: PlayableResource[] = [];
  let segments: QueueSegment[] = [];
  let originalQueue: PlayableResource[] | null = null;
  let current: PlayableResource | null = null;
  let isPlaying = false;
  let listenStartedAt = 0;
  let snapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<PlaybackSnapshot>) => {
    const keys = Object.keys(patch) as (keyof PlaybackSnapshot)[];
    if (keys.every(key => snapshot[key] === patch[key])) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: (): PlaybackSnapshot => snapshot,

    queue: (): PlayableResource[] => queue,
    setQueue: (next: PlayableResource[]) => { queue = next; },
    segments: (): QueueSegment[] => segments,
    setSegments: (next: QueueSegment[]) => { segments = next; },
    /** The queue as it stood before shuffling, to restore from. */
    originalQueue: (): PlayableResource[] | null => originalQueue,
    setOriginalQueue: (next: PlayableResource[] | null) => { originalQueue = next; },
    bumpQueue: () => update({ queueVersion: snapshot.queueVersion + 1 }),

    currentIndex: (): number => snapshot.currentIndex,
    setCurrentIndex: (index: number) => update({ currentIndex: index }),
    currentResource: (): PlayableResource | null => current,
    /** Swaps the resource in place — a refreshed URL — without moving the pointer. */
    setCurrentResource: (resource: PlayableResource | null) => {
      current = resource;
      if (resource) update({ currentSong: resource.song });
    },
    setActive: (index: number, resource: PlayableResource) => {
      current = resource;
      update({ currentIndex: index, currentSong: resource.song });
    },
    /** Empties the queue and everything that describes a place in it. Modes other than shuffle survive. */
    clearQueue: () => {
      queue = [];
      segments = [];
      originalQueue = null;
      current = null;
      update({ currentIndex: 0, currentSong: null, shuffleMode: 'off' });
    },

    repeatMode: (): RepeatModeState => snapshot.repeatMode,
    setRepeatMode: (mode: RepeatModeState) => update({ repeatMode: mode }),
    shuffleMode: (): ShuffleMode => snapshot.shuffleMode,
    setShuffleMode: (mode: ShuffleMode) => update({ shuffleMode: mode }),
    playbackSpeed: (): number => snapshot.playbackSpeed,
    setPlaybackSpeed: (speed: number) => update({ playbackSpeed: speed }),
    setVolume: (volume: number) => update({ volume }),
    setBuffering: (buffering: boolean) => update({ isBuffering: buffering }),

    /** Mirrors the player's own state for controllers that decide on it; not drawn from here. */
    isPlaying: (): boolean => isPlaying,
    setIsPlaying: (playing: boolean) => { isPlaying = playing; },

    /** When the listen now in progress began, for the scrobble it becomes. 0 is none. */
    listenStartedAt: (): number => listenStartedAt,
    markNewListen: (now: number = Date.now()) => { listenStartedAt = now; },
    clearListen: () => { listenStartedAt = 0; },
  };
}
