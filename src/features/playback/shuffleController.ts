import type { PlayerBackend } from '@/features/player/backend';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { ShuffleMode } from '@/domain/playback/PlaybackModes';
import shuffleArray from '@/features/playback/shuffleArray';
import type { CollectionContext } from '@/domain/playback/CollectionContext';
import {
  collectionSegment,
  reconcileUnshuffledQueue,
  soleCollectionContext,
  type QueueSegment,
} from './playingQueue';

/**
 * The shuffle button, which is a three-position cycle rather than a toggle.
 *
 * `off -> shuffle -> smart -> off`:
 *
 * - **shuffle** reorders what is already queued, keeping the track playing at
 *   the front so the music does not jump.
 * - **smart** keeps that order and blends in related tracks from outside the
 *   selection. It deliberately does *not* re-snapshot the pre-shuffle queue,
 *   so turning shuffle off from here still restores what the listener
 *   originally chose rather than the shuffled order.
 * - **off** restores that snapshot.
 *
 * **Restoring is a reconcile, not an assignment.** Every queue edit — add to
 * queue, play next, append an album, a failed track being dropped — changes
 * the live shuffled queue and never the snapshot. Restoring the snapshot
 * verbatim would silently lose everything added while shuffled and resurrect
 * everything removed, including tracks that were dropped because they could
 * not be played. `reconcileUnshuffledQueue` puts the original order back and
 * carries those edits across; anything Smart Shuffle injected survives the
 * same way, appended after the restored order.
 *
 * **A shuffled playlist is still that playlist.** Plays are credited to the
 * playlist a track's segment names, so reordering one playlist keeps its
 * segment rather than relabelling the queue ad hoc — which is how shuffling
 * mid-playlist used to stop it counting as played. A queue mixing sources has
 * no single collection to keep, and becomes ad hoc as before.
 */
export interface ShuffleControllerDeps {
  backend: () => PlayerBackend;
  queue: () => PlayableResource[];
  setQueue: (resources: PlayableResource[]) => void;
  segments: () => QueueSegment[];
  setSegments: (segments: QueueSegment[]) => void;
  currentIndex: () => number;
  setCurrentIndex: (index: number) => void;
  currentResource: () => PlayableResource | null;
  shuffleMode: () => ShuffleMode;
  setShuffleMode: (mode: ShuffleMode) => void;
  /** The pre-shuffle order, or null when nothing is shuffled. */
  originalQueue: () => PlayableResource[] | null;
  setOriginalQueue: (resources: PlayableResource[] | null) => void;
  isPlaying: () => boolean;
  bumpQueue: () => void;
  loadQueue: (
    resources: PlayableResource[],
    startIndex: number,
    play: boolean,
    seekToPosition: number
  ) => Promise<void>;
  injectSmartShuffleTracks: (wasPlaying: boolean, savedPosition: number) => Promise<void>;
}

interface ShuffleController {
  cycleShuffleMode: () => Promise<void>;
}

export function createShuffleController(deps: ShuffleControllerDeps): ShuffleController {
  /**
   * A cycle already running.
   *
   * Two of the three steps reload the whole queue, which is slow enough for a
   * second tap to land inside the first. Without this the two interleave and
   * the mode ends up somewhere neither tap asked for.
   */
  let cycling = false;

  /**
   * The collection a Smart Shuffle started from, for turning it off again.
   *
   * Smart Shuffle's own segment claims no collection — its queue interleaves
   * tracks from outside it — so by the time it is turned off the segments no
   * longer say where the snapshot came from. Tied to the snapshot it
   * describes, so a queue started since cannot inherit it.
   */
  let smartShuffledFrom: { snapshot: PlayableResource[]; context: CollectionContext } | null = null;

  return {
    async cycleShuffleMode() {
      if (cycling) return;
      cycling = true;

      // Captured before anything moves: both steps that reload the queue have
      // to put playback back exactly where it was, and the reload itself is
      // what makes the position unreadable.
      const wasPlaying = deps.isPlaying();
      const savedPosition = deps.backend().getProgress().position;
      const mode = deps.shuffleMode();

      try {
        if (mode === 'off') {
          deps.setOriginalQueue(deps.queue());

          // The track playing stays at the front. Shuffling it along with the
          // rest would cut the music off mid-track to start something else.
          const playing = deps.queue()[deps.currentIndex()];
          const rest = deps.queue().filter((_, index) => index !== deps.currentIndex());
          const shuffled = [playing, ...shuffleArray(rest)]
            .filter((resource): resource is PlayableResource => Boolean(resource));

          deps.setQueue(shuffled);
          const context = soleCollectionContext(deps.segments());
          deps.setSegments([collectionSegment(0, shuffled.length, context, 'shuffled')]);
          deps.setCurrentIndex(0);
          deps.setShuffleMode('shuffle');
          deps.bumpQueue();
          await deps.loadQueue(shuffled, 0, wasPlaying, savedPosition);
          return;
        }

        if (mode === 'shuffle') {
          // No re-snapshot: the snapshot still holds what the listener chose,
          // which is what turning shuffle off from here should restore.
          const snapshot = deps.originalQueue();
          const context = soleCollectionContext(deps.segments());
          smartShuffledFrom = snapshot && context ? { snapshot, context } : null;
          deps.setShuffleMode('smart');
          deps.bumpQueue();
          await deps.injectSmartShuffleTracks(wasPlaying, savedPosition);
          return;
        }

        const snapshot = deps.originalQueue();
        const context = snapshot && smartShuffledFrom?.snapshot === snapshot
          ? smartShuffledFrom.context
          : null;
        smartShuffledFrom = null;
        if (!snapshot) {
          // Shuffled by something that took no snapshot — a restored session,
          // or a selection played with `shuffle: true`. There is no original
          // order to go back to, so this only changes the label.
          deps.setShuffleMode('off');
          deps.bumpQueue();
          return;
        }

        const restored = reconcileUnshuffledQueue(
          snapshot,
          deps.queue(),
          resource => resource.song.localId
        );
        // Follow the track, not the index: the listener keeps hearing the same
        // song across the restore, wherever it sits in the original order.
        const playingId = deps.currentResource()?.song.localId;
        const found = playingId
          ? restored.findIndex(resource => resource.song.localId === playingId)
          : 0;
        const index = found === -1 ? 0 : found;

        // The reconcile puts the snapshot's tracks first and anything added
        // while shuffled after them, so only that first stretch is the
        // collection's.
        const snapshotIds = new Set(snapshot.map(resource => resource.song.localId));
        const fromSnapshot = restored.filter(resource => snapshotIds.has(resource.song.localId)).length;
        const segments = context && fromSnapshot > 0
          ? [
              collectionSegment(0, fromSnapshot, context, 'restored'),
              collectionSegment(fromSnapshot, restored.length - fromSnapshot, null, 'restored'),
            ].filter(segment => segment.length > 0)
          : [collectionSegment(0, restored.length, null, 'restored')];

        deps.setQueue(restored);
        deps.setSegments(segments);
        deps.setCurrentIndex(index);
        deps.setShuffleMode('off');
        deps.setOriginalQueue(null);
        deps.bumpQueue();
        await deps.loadQueue(restored, index, wasPlaying, savedPosition);
      } finally {
        cycling = false;
      }
    },
  };
}
