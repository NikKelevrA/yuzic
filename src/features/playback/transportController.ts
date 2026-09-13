import type { PlayerBackend } from '@/features/player/backend';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { RepeatModeState } from '@/domain/playback/PlaybackModes';
import { seekTarget } from './playingPolicies';

/**
 * Play, pause, seek and skip — against two players at once.
 *
 * There are always two things that could be playing: the on-device engine, and
 * a remote sink the user has handed playback to (a jukebox, a cast target).
 * Every command below has to reach the right one, and the rule is not
 * symmetrical:
 *
 * - When the **remote owns playback**, the local engine is not running and
 *   must not be touched. Calling `play()` on it would start a second copy of
 *   the track out of this device's speaker while the room plays the first.
 * - When it does not, the local engine is driven *and* the sink is still told,
 *   because a sink that is merely mirroring wants to stay in step.
 *
 * That asymmetry was previously spelled out at eight call sites inside a 1600
 * line provider, each one a `remoteOwnsPlayback()` check that had to be
 * remembered. Here it is in one place, with a test for each branch, and the
 * provider asks for a command rather than assembling one.
 *
 * Everything is reached through `deps` rather than captured, because a
 * controller that closed over React state would be rebuilt on every render and
 * would read whatever was true when it was built. The provider holds these
 * facts in refs precisely so a command issued now acts on the queue as it is
 * now, and the getters preserve that.
 */
export interface TransportDeps {
  backend: () => PlayerBackend;
  /** Whether a remote sink is playing the audio rather than this device. */
  remoteOwnsPlayback: () => boolean;
  sink: {
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    seek: (positionSeconds: number) => Promise<void>;
    skipTo: (index: number) => Promise<void>;
  };
  /** Where the remote is, since the local engine's progress is meaningless then. */
  jukeboxPosition: () => number;
  currentResource: () => PlayableResource | null;
  resourceAt: (index: number) => PlayableResource | undefined;
  queueLength: () => number;
  currentIndex: () => number;
  repeatMode: () => RepeatModeState;
  isPlaying: () => boolean;
  /**
   * Report the outgoing track's listen before the new one starts. Awaited: a
   * scrobble raised after the position has already moved is a scrobble with
   * the wrong number on it.
   */
  scrobbleOutgoing: (listenedSeconds: number) => Promise<void>;
  /** Point the provider's own index and current-song state at `index`. */
  setActive: (index: number, resource: PlayableResource) => void;
  /**
   * Start the listen clock for a newly started track.
   *
   * Separate from `setActive` because it must *not* fire when the listener
   * taps the track that is already playing: that is not a new listen, and
   * restarting the clock there means a track played to the end never reaches
   * the scrobble threshold.
   */
  markNewListen: () => void;
}

interface TransportController {
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  skipTo: (index: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionSeconds: number) => void;
  jumpBy: (deltaSeconds: number) => void;
}

export function createTransportController(deps: TransportDeps): TransportController {
  /**
   * Where playback is, from whichever player is actually playing.
   *
   * Asking the local engine while the remote owns playback returns the
   * position of a track it stopped playing however long ago — which is what a
   * scrobble would then be filed with, and what a relative seek would be
   * measured from.
   */
  const position = (): number =>
    deps.remoteOwnsPlayback()
      ? deps.jukeboxPosition()
      : deps.backend().getProgress().position;

  const reportOutgoing = () => deps.scrobbleOutgoing(Math.floor(position()));

  /** Resume only what was already playing: a skip made while paused stays paused. */
  const startIfItWasPlaying = () => {
    if (deps.isPlaying()) deps.backend().play();
  };

  return {
    async skipToNext() {
      await reportOutgoing();
      const next = deps.currentIndex() + 1;
      // Past the end is the end, unless repeat is going to wrap it.
      if (next >= deps.queueLength() && deps.repeatMode() !== 'all') return;
      if (deps.remoteOwnsPlayback()) {
        // Modulo, because this is the wrapping case — and guarded against an
        // empty queue, where the modulus would be zero and the result NaN.
        await deps.sink.skipTo(next % Math.max(1, deps.queueLength()));
        return;
      }
      deps.backend().skipToNext();
      startIfItWasPlaying();
    },

    async skipToPrevious() {
      await reportOutgoing();
      if (deps.currentIndex() <= 0) return;
      if (deps.remoteOwnsPlayback()) {
        await deps.sink.skipTo(deps.currentIndex() - 1);
        return;
      }
      deps.backend().skipToIndex(deps.currentIndex() - 1);
      startIfItWasPlaying();
    },

    async skipTo(index: number) {
      const resource = deps.resourceAt(index);
      if (!resource) return;
      // Tapping the track already playing is not a track change: filing a
      // listen for it would scrobble the same play twice, and restarting the
      // clock would stop the play in progress ever reaching the threshold.
      if (index !== deps.currentIndex()) {
        await reportOutgoing();
        deps.markNewListen();
      }

      deps.setActive(index, resource);

      if (deps.remoteOwnsPlayback()) {
        await deps.sink.skipTo(index);
        return;
      }
      deps.backend().skipToIndex(index);
      startIfItWasPlaying();
    },

    async pause() {
      if (!deps.remoteOwnsPlayback()) deps.backend().pause();
      await deps.sink.pause();
    },

    async resume() {
      if (!deps.remoteOwnsPlayback()) deps.backend().play();
      await deps.sink.resume();
    },

    seek(positionSeconds: number) {
      if (!deps.remoteOwnsPlayback()) deps.backend().seekTo(positionSeconds);
      void deps.sink.seek(positionSeconds);
    },

    jumpBy(deltaSeconds: number) {
      // The duration comes from the track rather than the player for the same
      // reason the position does: while the remote owns playback the local
      // engine has no idea what is playing, and a clamp against its zero
      // duration would send every forward jump to zero.
      const duration = deps.remoteOwnsPlayback()
        ? deps.currentResource()?.song.durationSeconds ?? 0
        : deps.backend().getProgress().duration;
      const target = seekTarget(position(), deltaSeconds, duration);
      if (!deps.remoteOwnsPlayback()) deps.backend().seekTo(target);
      void deps.sink.seek(target);
    },
  };
}
