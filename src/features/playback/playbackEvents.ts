import type { PlayerBackend } from '@/features/player/backend';
import type { MediaItem } from '@/features/player/mediaItem';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import { sourceKind } from '@/features/playback/playableResource';
import { resolvePlaybackErrorAction } from './playbackErrorRecovery';

/** How long a playback-error toast suppresses the next one. */
export const ERROR_TOAST_INTERVAL_MS = 1500;

/**
 * What the app *does* about a playback failure.
 *
 * The decision is `playbackErrorRecovery`'s and it is pure: given how far the
 * track had got and what has already been tried, resume, retry, or give up.
 * This is the other half — carrying the decision out — and it is the half that
 * has to touch the player, the queue and the toast.
 *
 * The two were previously one ninety-line closure inside the provider, with
 * its three pieces of memory living as provider refs among forty others.
 * Those three exist only for this, so they live here now as closure state,
 * where nothing else can reach them and their lifetime is the handler's.
 *
 * **Why a stall resumes rather than restarts.** A failure fifty-seven seconds
 * into a track is a stream that stalled, not a track that cannot be played,
 * and the two want opposite responses. Restarting a stalled track is what made
 * the same minute of a song play twice before the track was dropped as
 * unplayable — the symptom a listener describes as the song not playing
 * through.
 */
export interface PlaybackEventDeps {
  backend: () => PlayerBackend;
  currentResource: () => PlayableResource | null;
  queue: () => PlayableResource[];
  currentIndex: () => number;
  /**
   * Rebuild one resource with a freshly resolved stream URL. The retry path's
   * whole purpose: a Navidrome token goes stale across a JavaScript context
   * restart, and every URL in the queue carries one.
   */
  refreshResource: (song: Song) => PlayableResource | null;
  toMediaItems: (resources: PlayableResource[]) => MediaItem[];
  replaceQueue: (resources: PlayableResource[]) => void;
  setCurrentResource: (resource: PlayableResource | null) => void;
  /** Drop the track that cannot be played and move on. */
  removeFailedCurrentTrack: () => void;
  notifyError: () => void;
  logFailure: (info: Record<string, unknown>) => void;
  /** Injected so the toast throttle can be tested without waiting it out. */
  now: () => number;
}

interface PlaybackEventHandlers {
  /** A failure arrived from the player. */
  onError: (event: { code?: string; message: string }) => void;
  /**
   * A track actually started playing.
   *
   * The player only reports an item active once it is really playing, so this
   * is the proof that whatever was last attempted worked — which is what
   * clears the "already retried once" state. Without it a track that failed,
   * was retried successfully, and later stalled would be treated as a second
   * failure of the same attempt and dropped instead of resumed.
   */
  onTrackStarted: () => void;
}

export function createPlaybackEventHandlers(deps: PlaybackEventDeps): PlaybackEventHandlers {
  /** The track a recovery has already been attempted for, so a second failure gives up. */
  let lastRecoveryAttemptedId: string | null = null;
  /** Stalls resumed for the current song, so a connection that will never serve it cannot loop. */
  let stallResumes: { songId: string | null; count: number } = { songId: null, count: 0 };
  /** When the last failure toast was shown, so a burst produces one. */
  let lastErrorToastAt = 0;

  return {
    onTrackStarted() {
      lastRecoveryAttemptedId = null;
    },

    onError(event) {
      const resource = deps.currentResource();
      const song = resource?.song;

      deps.logFailure({
        code: event.code,
        message: event.message,
        songId: song?.nativeId,
        title: song?.title,
        source: sourceKind(resource),
        provenance: song?.provenance,
      });

      // A preview URL is issued once and cannot be rebuilt from an id, so
      // there is nothing to refresh and nothing to retry — see
      // `hasReissuableUrl`. Anything else here would be a retry loop.
      if (song?.contentKind === 'preview') {
        deps.removeFailedCurrentTrack();
        return;
      }

      const positionSeconds = deps.backend().getProgress().position;
      const songId = song?.localId ?? null;
      // The stall budget belongs to a song, not to the session: a new track
      // starts with a full one.
      if (stallResumes.songId !== songId) stallResumes = { songId, count: 0 };

      const decision = resolvePlaybackErrorAction(
        lastRecoveryAttemptedId,
        song?.localId,
        { positionSeconds, stallCount: stallResumes.count }
      );

      if (decision.action === 'resume') {
        stallResumes = { songId, count: decision.nextStallCount };
        // Back to where it was, not back to the start.
        deps.backend().seekTo(decision.positionSeconds);
        deps.backend().play();
        return;
      }

      if (decision.action === 'retry') {
        lastRecoveryAttemptedId = decision.nextLastRecoveryAttemptedId;
        // Every URL in the queue, not just this track's: they all came from
        // the same session and went stale together.
        const fresh = deps.queue()
          .map(entry => deps.refreshResource(entry.song))
          .filter((entry): entry is PlayableResource => Boolean(entry));
        deps.replaceQueue(fresh);
        deps.setCurrentResource(fresh[deps.currentIndex()] ?? resource ?? null);
        deps.backend().setMediaItems(deps.toMediaItems(fresh), deps.currentIndex());
        deps.backend().play();
        return;
      }

      // Refreshing the URL did not help, so this is a track that genuinely
      // will not play. Throttled, because a queue of unplayable tracks fails
      // once per track and a toast each would bury the screen.
      const now = deps.now();
      if (now - lastErrorToastAt > ERROR_TOAST_INTERVAL_MS) {
        lastErrorToastAt = now;
        deps.notifyError();
      }

      deps.removeFailedCurrentTrack();
    },
  };
}
