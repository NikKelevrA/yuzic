import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSelector } from 'react-redux';

import type { Song } from '@/domain/entities/Song';
import { getBackend } from '@/features/player/activeBackend';
import { selectActiveServerId, selectCredentialsHydrated } from '@/state/redux/selectors/serversSelectors';
import {
  clearListenCheckpoint,
  readListenCheckpoint,
  saveListenCheckpoint,
} from './listenCheckpoint';
import { finishListen, latchListen, listenedSoFar, observePosition } from './listenMeter';
import type { PlaybackSession, PlaybackSnapshot } from './playbackSession';
import { isRepeatLoop } from './repeatPlay';
import type { PlaybackServices } from './usePlaybackServices';

/** How often a playing track reports progress and saves its position. */
const HEARTBEAT_MS = 10_000;

/**
 * Keeps what outlives this session in step with it: the persisted queue,
 * modes and position, the server's view of the session, and a looping
 * track's repeat listens.
 */
export function usePlaybackPersistenceSync({
  session,
  snapshot,
  isPlaying,
  services,
  scrobbleOutgoing,
}: {
  session: PlaybackSession;
  snapshot: PlaybackSnapshot;
  isPlaying: boolean;
  services: PlaybackServices;
  scrobbleOutgoing: (song: Song | null, listenedSeconds: number) => Promise<void>;
}): void {
  const {
    persistence,
    reportPlaybackProgress,
    resetLastScrobbled,
    nowPlaying,
    scrobble,
    hasOpenServerSession,
    adoptOpenServerSession,
  } = services;
  /** Position at the previous heartbeat, so a looping track's restart is visible. */
  const lastTickPosition = useRef(0);
  const activeServerId = useSelector(selectActiveServerId);
  const credentialsHydrated = useSelector(selectCredentialsHydrated);

  /**
   * Writes down the listen in progress, for a process that may not get to
   * report it. See `listenCheckpoint` for why this exists at all.
   */
  const writeCheckpoint = useCallback((song: Song, positionSeconds: number) => {
    if (!activeServerId) return;
    saveListenCheckpoint({
      serverId: activeServerId,
      startedAt: session.listenStartedAt(),
      positionSeconds: Math.max(0, Math.floor(positionSeconds)),
      listenedSeconds: listenedSoFar(positionSeconds),
      sessionOpen: hasOpenServerSession(),
      song,
    });
  }, [activeServerId, hasOpenServerSession, session]);

  /*
   Backgrounding is the checkpoint, because a kill is not.

   Neither platform promises a callback when the process is killed — an
   Android low-memory reap and an iOS swipe from the app switcher both simply
   end. `background` is the last moment anything of ours is guaranteed to run,
   so that is where the record is written; the heartbeat above keeps it no more
   than ten seconds stale in the cases where even that does not fire.

   Note what this does *not* do: it does not report anything. Backgrounding is
   not stopping. A listener locking their phone with music playing sends the
   app to the background several times an hour, and a `Stopped` on each one
   would end the session, blank the server's dashboard and hand the scrobbler
   plugins a listen per screen-lock. The record is written and playback carries
   on; only a launch that finds a record left behind concludes anything from
   it.
  */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'background' && state !== 'inactive') return;
      const resource = session.currentResource();
      if (!resource) return;
      writeCheckpoint(resource.song, getBackend().getProgress().position);
    });
    return () => { subscription.remove(); };
  }, [session, writeCheckpoint]);

  /*
   Finish the listen the last run of the app could not.

   Once, on the first launch that has a server to report to — the adapter is
   an empty stub until the keystore read lands, and a replay through that stub
   would fail every submission and park them all in the offline queue for no
   reason. Not on a return from the background: this effect does not run again
   there, which is what keeps a screen-lock from being reported as a listen.

   The replay is deliberately not a special path. It seeds the meter with what
   was heard, adopts the session the old process opened so the departure is
   allowed to close it, and then goes through `scrobbleIfNeeded` exactly as a
   real departure does — same threshold, same history entry, same offline
   queue when the network is gone.
  */
  const replayedRef = useRef(false);
  useEffect(() => {
    if (replayedRef.current) return;
    if (!activeServerId || !credentialsHydrated) return;
    replayedRef.current = true;

    const checkpoint = readListenCheckpoint();
    if (!checkpoint) return;
    // A checkpoint belongs to the server it was recorded against. Replaying
    // one against a different server would report a listen to somebody who
    // never served it, using ids that mean something else there.
    if (checkpoint.serverId !== activeServerId) {
      clearListenCheckpoint();
      return;
    }

    latchListen(checkpoint.song.nativeId, checkpoint.listenedSeconds);
    if (checkpoint.sessionOpen) adoptOpenServerSession(checkpoint.song.nativeId);
    void scrobble.current(checkpoint.song, {
      listenedSeconds: checkpoint.positionSeconds,
      startTime: checkpoint.startedAt,
    });
  }, [activeServerId, adoptOpenServerSession, credentialsHydrated, scrobble]);

  // The heartbeat. Jellyfin drops a session it stops hearing progress from
  // (and never fires the Stopped event its Last.fm plugin scrobbles on); 10s
  // is well inside its ~30s idle window. The same tick saves the position, so
  // a kill loses at most ~10s of resume precision.
  //
  // It runs while *paused* too, which it did not before. Stopping on pause had
  // two costs that looked like one: the server was never told about the pause
  // at all — `isPaused` was hardcoded false on the way out, so the parameter
  // was dead and the dashboard showed the track still running — and the
  // session then aged out of the server's idle window while the listener was
  // holding their place. A paused position does not move, so the tick costs a
  // request and changes nothing else.
  useEffect(() => {
    if (!snapshot.currentSong) {
      lastTickPosition.current = 0;
      return;
    }
    const interval = setInterval(() => {
      const resource = session.currentResource();
      if (!resource) return;
      const { position, duration } = getBackend().getProgress();

      // Every ten seconds is the only regular look at the playhead anything
      // gets, so it is also how the meter learns that time passed.
      observePosition(position);

      // A track on repeat never changes media item, so nothing else sees it
      // finish. Catching the restart is what makes the second time round a
      // second listen instead of being folded into the first.
      const isLooping = session.repeatMode() === 'one'
        || (session.repeatMode() === 'all' && session.queue().length === 1);
      if (isRepeatLoop({ isLooping, previousPosition: lastTickPosition.current, currentPosition: position, duration })) {
        // The pass that just ended is its own listen, so the guard against
        // scrobbling one track twice is released for it — and the meter is
        // closed *first*, because releasing the guard also clears it.
        finishListen(resource.song.nativeId, lastTickPosition.current);
        resetLastScrobbled();
        const song = resource.song;
        void scrobbleOutgoing(song, Math.floor(lastTickPosition.current)).then(() => {
          // That departure closed the server's session, which is what makes
          // the pass scrobble at all — the plugins fire on Stopped. The track
          // is still playing, though, and no track change will announce it
          // again, so this pass opens its own session. Sequenced after the
          // stop so the server never sees the start first.
          nowPlaying.current(song);
        });
        session.markNewListen();
      }
      lastTickPosition.current = position;

      reportPlaybackProgress(resource.song, Math.floor(position * 1000), !isPlaying);
      persistence.current.persistPosition(position);
      writeCheckpoint(resource.song, position);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [isPlaying, snapshot.currentSong, persistence, reportPlaybackProgress, resetLastScrobbled,
    scrobbleOutgoing, session, nowPlaying, writeCheckpoint]);

  useEffect(() => {
    session.setIsPlaying(isPlaying);
    // Saved immediately on pause, so a kill while paused resumes exactly
    // where it stopped rather than up to a heartbeat earlier.
    if (!isPlaying && session.currentResource()) {
      persistence.current.persistPosition(getBackend().getProgress().position, { force: true });
    }
  }, [isPlaying, persistence, session]);

  useEffect(() => { persistence.current.persistRepeatMode(snapshot.repeatMode); }, [persistence, snapshot.repeatMode]);
  useEffect(() => { persistence.current.persistShuffleMode(snapshot.shuffleMode); }, [persistence, snapshot.shuffleMode]);

  // Every queue edit bumps the version, so persisting here covers all of them
  // without each edit having to remember to.
  useEffect(() => {
    if (snapshot.queueVersion === 0) return;
    persistence.current.persistQueue({
      queue: session.queue(),
      segments: session.segments(),
      currentIndex: session.currentIndex(),
      repeatMode: session.repeatMode(),
      shuffleMode: session.shuffleMode(),
    });
  }, [persistence, session, snapshot.queueVersion]);
}
