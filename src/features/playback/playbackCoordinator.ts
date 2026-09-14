import type { PlayerBackend } from '@/features/player/backend';
import type { MediaItem } from '@/features/player/mediaItem';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import { sameQueue } from '@/features/playback/playableResource';
import { isAutoplaySeed } from '@/domain/playback/ContentKind';
import { shouldFillQueue } from './autoplayFill';
import { resourceFromMediaItem, resourcesFromPlayerQueue } from './playingQueue';

/**
 * Everything that follows from a track starting.
 *
 * The player reports an item active once it is genuinely playing, and eight
 * separate things hang off that moment: the outgoing track has to be scrobbled
 * and bookmarked, the queue has to be reconciled against the engine's, the
 * active pointer has to move and be persisted, a bookmarked track has to
 * resume, the playback rate has to follow the *kind* of thing now playing, the
 * now-playing report has to go out, the server-side queue has to be synced,
 * and autoplay has to decide whether to top the queue up.
 *
 * They lived as one closure in the provider, in an order that mattered and was
 * nowhere stated. It matters in two places especially:
 *
 * - The outgoing scrobble and bookmark are read from the player's position
 *   *before* anything moves the pointer. Afterwards that position belongs to
 *   the new track, and both would be filed against the wrong one.
 * - Autoplay is asked last, because it reads the queue length and the index
 *   this function has just settled.
 *
 * Nothing here is awaited that the listener would feel. A bookmark save or a
 * queue sync failing must not hold up the next track.
 */
export interface PlaybackCoordinatorDeps {
  backend: () => PlayerBackend;
  queue: () => PlayableResource[];
  setQueue: (resources: PlayableResource[]) => void;
  currentResource: () => PlayableResource | null;
  /** Point the provider's index and current-song state at this track. */
  setActive: (index: number, resource: PlayableResource) => void;
  /**
   * Resources the app knows about but that are not in the queue. The last
   * place looked before rebuilding a track from the player's own item.
   */
  library: () => Map<string, PlayableResource>;
  bumpQueue: () => void;

  /** Clear the "already retried once" state — this track is genuinely playing. */
  onTrackStarted: () => void;
  scrobbleOutgoing: (song: Song, listenedSeconds: number) => void;
  /** Restart the listen clock for the track now playing. */
  markNewListen: () => void;
  /**
   * Save or clear a resume point for the track being left. Filtered to
   * long-form tracks and podcasts inside the manager — a three-minute song
   * left half-way does not earn one.
   */
  saveBookmark: (song: Song, positionSeconds: number) => void;
  /** `null` when the track has no resume point, or bookmarking is off. */
  resumePositionFor: (song: Song) => number | null;
  persistCurrentIndex: (index: number) => void;

  /** The rate this kind of thing should play at — talking and music differ. */
  speedFor: (song: Song) => number;
  currentSpeed: () => number;
  setSpeed: (speed: number) => void;

  submitNowPlaying: (song: Song) => void;
  syncServerQueue: (queue: PlayableResource[], nativeId: string, positionMs: number) => void;

  autoplayEnabled: () => boolean;
  isFilling: () => boolean;
  fillQueueIfLow: () => void;
}

interface PlaybackCoordinator {
  onActiveTrackChanged: (item: MediaItem | null | undefined) => void;
}

/** Below this, the listener has not moved off the top of the track themselves. */
const RESUME_IF_WITHIN_SEC = 2;

export function createPlaybackCoordinator(
  deps: PlaybackCoordinatorDeps
): PlaybackCoordinator {
  /**
   * Where the track now playing sits in the queue, and what it is.
   *
   * The engine's own index is preferred over a search: it is the authority on
   * what is playing, and a queue holding the same track twice would have a
   * search find the first copy rather than the one being heard.
   */
  const locate = (
    item: MediaItem,
    mediaId: string
  ): { index: number; resource: PlayableResource; fromLibrary: boolean } | null => {
    const nativeIndex = deps.backend().getActiveMediaItemIndex();
    const index = typeof nativeIndex === 'number' && nativeIndex >= 0
      ? nativeIndex
      : deps.queue().findIndex(entry => entry.song.localId === mediaId);

    const queued = index >= 0 ? deps.queue()[index] : undefined;
    if (queued) return { index, resource: queued, fromLibrary: false };

    // Not in the queue. The library is the next place to look, and a track
    // found there is one the queue does not contain at all — which is why the
    // caller replaces the queue with it rather than pointing an index at a
    // position that holds something else.
    const known = index < 0 ? deps.library().get(mediaId) : undefined;
    if (known) return { index, resource: known, fromLibrary: true };

    // Nothing knows this track, so rebuild it from what the player echoed —
    // the media id carries provenance and the origin's own id. Reached when a
    // queue survives into a fresh JavaScript context that has lost it.
    const rebuilt = item.url ? resourceFromMediaItem(item) : null;
    return rebuilt ? { index: 0, resource: rebuilt, fromLibrary: false } : null;
  };

  return {
    onActiveTrackChanged(item) {
      const mediaId = item?.mediaId;
      if (!item || !mediaId) return;

      deps.onTrackStarted();

      // Read before anything moves the pointer: a moment later this position
      // belongs to the track now playing, and both the listen and the resume
      // point would be filed against the wrong song.
      const previous = deps.currentResource();
      if (previous && previous.song.localId !== mediaId) {
        const leftAt = Math.floor(deps.backend().getProgress().position);
        deps.scrobbleOutgoing(previous.song, leftAt);
        deps.saveBookmark(previous.song, leftAt);
        deps.markNewListen();
      }

      // The engine owns membership and order; this is the app catching up to
      // whatever it did — including the edits the app never made.
      const reconciled = resourcesFromPlayerQueue(
        deps.backend().getQueue(),
        deps.queue(),
        deps.library()
      );
      if (reconciled.length && !sameQueue(deps.queue(), reconciled)) {
        deps.setQueue(reconciled);
        deps.bumpQueue();
      }

      const located = locate(item, mediaId);
      if (!located) return;
      const { resource } = located;
      let index = located.index;

      // A track that is playing but is in no queue becomes the queue of one.
      // Leaving the old queue in place would point the active index at a
      // position holding a different song entirely.
      if (located.fromLibrary) {
        deps.setQueue([resource]);
        index = 0;
        deps.bumpQueue();
      }

      deps.setActive(index, resource);
      const song = resource.song;

      // The queue itself does not change every track; the pointer does, so
      // this is the frequent write and the only one worth doing here.
      deps.persistCurrentIndex(index);

      // Resume a bookmarked track, but only from the top. Someone who has
      // already scrubbed forward is where they want to be.
      const resumeAt = deps.resumePositionFor(song);
      if (resumeAt && Math.floor(deps.backend().getProgress().position) < RESUME_IF_WITHIN_SEC) {
        deps.backend().seekTo(resumeAt);
      }

      // Rate follows what is playing, not whatever was last set. One global
      // speed meant a podcast at 1.5x carried into the next song and reset to
      // 1x on every launch — both wrong for the same reason.
      const speed = deps.speedFor(song);
      if (speed !== deps.currentSpeed()) deps.setSpeed(speed);

      deps.submitNowPlaying(song);

      // Sent as `nativeId`: this goes to the server, which knows only its own
      // ids, not the app's branded identity.
      deps.syncServerQueue(
        deps.queue(),
        song.nativeId,
        Math.floor(deps.backend().getProgress().position * 1000)
      );

      // Last, because it reads the queue length and the index just settled.
      // A radio station is its own infinite feed with no seed to compute a
      // follow-up from, and a podcast's "next episode" is not a similarity
      // call — neither is a candidate for filling.
      if (isAutoplaySeed(song.contentKind) && shouldFillQueue({
        queueLength: deps.queue().length,
        currentIndex: index,
        autoplayEnabled: deps.autoplayEnabled(),
        isFilling: deps.isFilling(),
      })) {
        deps.fillQueueIfLow();
      }
    },
  };
}
