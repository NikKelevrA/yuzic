import type { PlayerBackend } from '@/features/player/backend';
import type { MediaItem } from '@/features/player/mediaItem';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import type { ShuffleMode } from '@/domain/playback/PlaybackModes';
import { assertPlayable, isPlayable, playableOnly } from '@/features/playback/playableResource';
import shuffleArray from '@/features/playback/shuffleArray';
import { clampStartIndex, trimQueueAroundIndex } from './adhocQueue';
import { tagSegment, type QueueSegment, type QueueSegmentSource } from './playingQueue';
import type { PlayableCollection } from './playingTypes';

/**
 * The commands that *begin* playback, as opposed to editing a queue that is
 * already playing.
 *
 * Five of them, and they agree on more than they differ: resolve a selection
 * into playable resources, decide the starting index, replace the queue and
 * its segment map, settle the shuffle state, and hand the result to the
 * player. What varies is where the starting index comes from and what context
 * the new segment records.
 *
 * **The shuffle snapshot is the subtle part.** `originalQueue` is what "turn
 * shuffle off" restores, and it has to be taken *before* the shuffle and from
 * the untrimmed list — shuffling first would snapshot an order nobody chose,
 * and trimming first would make turning shuffle off lose tracks. Every starter
 * that does not shuffle clears it, because a stale snapshot restored later is
 * a queue from two selections ago.
 */
export interface PlaybackStarterDeps {
  backend: () => PlayerBackend;
  queue: () => PlayableResource[];
  setQueue: (resources: PlayableResource[]) => void;
  segments: () => QueueSegment[];
  setSegments: (segments: QueueSegment[]) => void;
  /** Point the provider's index and current-song state at this track. */
  setActive: (index: number, resource: PlayableResource) => void;
  setShuffleMode: (mode: ShuffleMode) => void;
  /** What "turn shuffle off" restores. Null when nothing is shuffled. */
  setOriginalQueue: (resources: PlayableResource[] | null) => void;
  resolvePlayableSong: (song: Song) => PlayableResource | null;
  toMediaItems: (resources: PlayableResource[]) => MediaItem[];
  bumpQueue: () => void;
  loadQueue: (resources: PlayableResource[], startIndex: number) => Promise<void>;
  /** Injected so an ad-hoc queue's generated context id is predictable in tests. */
  now: () => number;
}

/** A collection the listener can play or append: an album or a playlist. */
export interface StartableCollection {
  songs: Song[];
  contextId: string;
  contextType: 'album' | 'playlist';
}

/**
 * An album or playlist as the starters want it: the tracks and where they
 * came from. Named by the origin's own id, because plays are recorded under
 * the queue's context id and read back by `nativeId` — see `CollectionContext`.
 */
export function startableCollection(collection: PlayableCollection): StartableCollection {
  return 'album' in collection
    ? { songs: collection.songs, contextId: collection.album.nativeId, contextType: 'album' }
    : { songs: collection.songs, contextId: collection.playlist.nativeId, contextType: 'playlist' };
}

interface PlaybackStarters {
  playSong: (song: Song) => Promise<void>;
  playSongs: (
    songs: Song[],
    options?: { startIndex?: number; shuffle?: boolean; contextId?: string }
  ) => Promise<void>;
  playCollection: (
    selectedSong: Song,
    collection: StartableCollection,
    shuffle?: boolean
  ) => Promise<void>;
  appendCollection: (collection: StartableCollection, shuffle: boolean) => void;
}

export function createPlaybackStarters(deps: PlaybackStarterDeps): PlaybackStarters {
  const resolveAll = (songs: Song[]): PlayableResource[] =>
    playableOnly(
      songs
        .map(deps.resolvePlayableSong)
        .filter((resource): resource is PlayableResource => Boolean(resource))
    );

  /**
   * Replace the queue wholesale and start it.
   *
   * The one place the five starters converge, so the order is stated once: the
   * queue and its segments first, then the active pointer, then the screen,
   * then the player. Telling the player before the app's own state has settled
   * would have the first `trackChange` arrive against the previous queue.
   */
  const replaceQueueWith = async (
    resources: PlayableResource[],
    index: number,
    source: QueueSegmentSource
  ) => {
    deps.setQueue(resources);
    deps.setSegments([{ startIndex: 0, length: resources.length, source }]);
    deps.setActive(index, resources[index]);
    deps.bumpQueue();
    await deps.loadQueue(resources, index);
  };

  return {
    async playSong(song: Song) {
      const resource = deps.resolvePlayableSong(song);
      if (!resource) throw new Error(`Track has no playable media URL: ${song.localId}`);
      assertPlayable([resource]);

      // A single track is its own context, and it is never shuffled — so the
      // snapshot is cleared rather than taken.
      deps.setOriginalQueue(null);
      deps.setShuffleMode('off');
      await replaceQueueWith([resource], 0, {
        kind: 'user',
        contextId: resource.song.localId,
        contextType: 'adhoc',
      });
    },

    async playSongs(songs, options = {}) {
      // Library rows carry no stream URL; `resolvePlayableSong` derives one
      // from the id, so this needs no per-track network call up front.
      let resources = resolveAll(songs);
      if (!resources.length) throw new Error('No playable tracks in selection');

      let index = clampStartIndex(resources.length, options.startIndex);

      if (options.shuffle) {
        // Snapshot before shuffling and before trimming: this is what turning
        // shuffle off restores, and it has to be the order the listener chose,
        // at its full length.
        deps.setOriginalQueue(resources);
        resources = shuffleArray(resources);
        index = 0;
        deps.setShuffleMode('shuffle');
      } else {
        deps.setOriginalQueue(null);
        deps.setShuffleMode('off');
      }

      // Trimmed after the shuffle, so the cap bounds the queue without
      // bounding what the shuffle could draw from.
      const trimmed = trimQueueAroundIndex(resources, index);

      await replaceQueueWith(trimmed.songs, trimmed.index, {
        kind: 'user',
        contextId: options.contextId ?? `adhoc-${deps.now()}`,
        contextType: 'adhoc',
      });
    },

    async playCollection(selectedSong, collection, shuffle = false) {
      let resources = resolveAll(collection.songs);
      if (!resources.length) {
        throw new Error(`Collection has no playable media URLs: ${collection.contextId}`);
      }

      // Checked before anything is changed: tapping a track whose URL cannot
      // be built should fail without having replaced the queue first.
      const selected = deps.resolvePlayableSong(selectedSong);
      if (!selected || !isPlayable(selected)) {
        throw new Error(`Track has no playable media URL: ${selectedSong.localId}`);
      }

      let index = 0;
      if (shuffle) {
        // Shuffling an album from a track means shuffling the album, not
        // starting at that track — so the index stays at the top.
        deps.setOriginalQueue(resources);
        resources = shuffleArray(resources);
        deps.setShuffleMode('shuffle');
      } else {
        deps.setOriginalQueue(null);
        index = resources.findIndex(r => r.song.localId === selectedSong.localId);
        if (index === -1) index = 0;
        deps.setShuffleMode('off');
      }

      await replaceQueueWith(resources, index, {
        kind: 'user',
        contextId: collection.contextId,
        contextType: collection.contextType,
      });
    },

    appendCollection(collection, shuffle) {
      // Tracks already queued are skipped rather than duplicated — adding an
      // album twice should not give the listener two of every song.
      const queued = new Set(deps.queue().map(resource => resource.song.localId));
      const resolved = resolveAll(collection.songs.filter(song => !queued.has(song.localId)));
      const toAdd = shuffle ? shuffleArray(resolved) : resolved;
      if (!toAdd.length) return;

      const insertAt = deps.queue().length;
      deps.setQueue([...deps.queue(), ...toAdd]);
      // Appended, so the existing segments are untouched: nothing moved, and
      // the stretch being added starts past the end of all of them.
      deps.setSegments(tagSegment(deps.segments(), insertAt, toAdd.length, {
        kind: 'user',
        contextId: collection.contextId,
        contextType: collection.contextType,
      }));
      deps.backend().addMediaItems(deps.toMediaItems(toAdd));
      deps.bumpQueue();
    },
  };
}
