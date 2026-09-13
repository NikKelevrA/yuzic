import type { PlayerBackend } from '@/features/player/backend';
import type { MediaItem } from '@/features/player/mediaItem';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import { assertPlayable } from '@/features/playback/playableResource';
import { movedCurrentIndex } from './playingPolicies';
import {
  moveSongAfterCurrent,
  shiftSegmentsAfterInsert,
  tagSegment,
  type QueueSegment,
} from './playingQueue';

/**
 * Editing the queue the listener can see.
 *
 * Every edit here has to keep four things in step, and the fourth is the one
 * that gets forgotten:
 *
 * 1. The in-memory queue, which is what the screen draws.
 * 2. The player, which is what actually plays.
 * 3. The active index, which has to *follow the same track* across a move
 *    rather than stay on the same number — see `movedCurrentIndex`.
 * 4. The segment map, which records which stretch of the queue came from
 *    which album or playlist. A queue is not a flat list to everything that
 *    reads it: "play the rest of this album" needs to know where the album
 *    ends, and an insert that does not shift the segments after it silently
 *    moves that boundary onto the wrong track.
 *
 * The rules the edits are built from are already pure and tested elsewhere —
 * `movedCurrentIndex`, `moveSongAfterCurrent`, `tagSegment`,
 * `shiftSegmentsAfterInsert`. What was missing was anywhere to test that an
 * edit applies all four, which is what this module is.
 *
 * These edits are optimistic, and stay so deliberately: the screen redraws on
 * the tap rather than an event later. The engine owns the queue in the end,
 * and its `queueChange` replaces whatever is predicted here — see the
 * reconciliation in `PlayingContext`.
 */
export interface QueueControllerDeps {
  backend: () => PlayerBackend;
  queue: () => PlayableResource[];
  setQueue: (resources: PlayableResource[]) => void;
  segments: () => QueueSegment[];
  setSegments: (segments: QueueSegment[]) => void;
  currentIndex: () => number;
  setCurrentIndex: (index: number) => void;
  currentResource: () => PlayableResource | null;
  /** Pair a song with a freshly resolved stream URL, or null if it has none. */
  resolvePlayableSong: (song: Song) => PlayableResource | null;
  buildItem: (resource: PlayableResource) => MediaItem;
  /** Tell the screen the queue changed. */
  bumpQueue: () => void;
}

interface QueueController {
  moveTrack: (from: number, to: number) => void;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
}

/** A track the listener queued by hand, rather than one that came with a collection. */
const adhocSegment = (resource: PlayableResource) => ({
  kind: 'user' as const,
  contextId: resource.song.localId,
  contextType: 'adhoc' as const,
});

export function createQueueController(deps: QueueControllerDeps): QueueController {
  /**
   * A song, resolved and checked, or a throw.
   *
   * Throwing rather than returning null: this is reached from a menu the
   * listener tapped, and silently doing nothing to a queue they just asked to
   * change is the worst of the available outcomes.
   */
  const playableOrThrow = (song: Song): PlayableResource => {
    const resource = deps.resolvePlayableSong(song);
    if (!resource) throw new Error(`Track has no playable media URL: ${song.localId}`);
    assertPlayable([resource]);
    return resource;
  };

  return {
    moveTrack(from: number, to: number) {
      if (from === to) return;
      const next = [...deps.queue()];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      deps.setQueue(next);
      deps.backend().moveMediaItem(from, to);
      // The index follows the track, not the number. Dragging the track above
      // the current one past it means the listener is now at index 0 and
      // still hearing the same song.
      deps.setCurrentIndex(movedCurrentIndex(deps.currentIndex(), from, to));
      deps.bumpQueue();
    },

    addToQueue(song: Song) {
      const resource = playableOrThrow(song);
      // Already queued is not an error and not a second copy — the listener
      // asked for it to be in the queue, and it is.
      if (deps.queue().some(entry => entry.song.localId === resource.song.localId)) return;

      const insertAt = deps.queue().length;
      deps.setQueue([...deps.queue(), resource]);
      deps.setSegments(tagSegment(deps.segments(), insertAt, 1, adhocSegment(resource)));
      deps.backend().addMediaItems([deps.buildItem(resource)]);
      deps.bumpQueue();
    },

    playNext(song: Song) {
      // Nothing is playing, so there is no "next" to be after.
      if (!deps.currentResource()) return;
      const resource = playableOrThrow(song);

      const update = moveSongAfterCurrent(
        deps.queue(),
        deps.currentIndex(),
        resource,
        queued => queued.song.localId
      );
      if (!update) return;

      if (update.removedIndex !== null) {
        // Already in the queue, so this is a move rather than an insert — and
        // the segments are untouched, because nothing was added: the track
        // keeps whatever context it was queued under.
        deps.backend().moveMediaItem(update.removedIndex, update.insertIndex);
      } else {
        deps.backend().insertMediaItem(update.insertIndex, deps.buildItem(resource));
        // Shift *then* tag. Tagging first would write the new segment at the
        // insert point and then shift it along with everything after it,
        // leaving the track the listener queued marked as part of whatever
        // album happened to follow.
        deps.setSegments(tagSegment(
          shiftSegmentsAfterInsert(deps.segments(), update.insertIndex, 1),
          update.insertIndex,
          1,
          adhocSegment(resource)
        ));
      }

      deps.setQueue(update.queue);
      deps.setCurrentIndex(update.currentIndex);
      deps.bumpQueue();
    },
  };
}
