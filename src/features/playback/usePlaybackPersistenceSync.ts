import { useEffect, useRef } from 'react';

import type { Song } from '@/domain/entities/Song';
import { getBackend } from '@/features/player/activeBackend';
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
  const { persistence, reportPlaybackProgress, resetLastScrobbled } = services;
  /** Position at the previous heartbeat, so a looping track's restart is visible. */
  const lastTickPosition = useRef(0);

  // The heartbeat. Jellyfin drops a session it stops hearing progress from
  // (and never fires the Stopped event its Last.fm plugin scrobbles on); 10s
  // is well inside its ~30s idle window. The same tick saves the position, so
  // a kill loses at most ~10s of resume precision.
  useEffect(() => {
    if (!isPlaying) {
      lastTickPosition.current = 0;
      return;
    }
    const interval = setInterval(() => {
      const resource = session.currentResource();
      if (!resource) return;
      const { position, duration } = getBackend().getProgress();

      // A track on repeat never changes media item, so nothing else sees it
      // finish. Catching the restart is what makes the second time round a
      // second listen instead of being folded into the first.
      const isLooping = session.repeatMode() === 'one'
        || (session.repeatMode() === 'all' && session.queue().length === 1);
      if (isRepeatLoop({ isLooping, previousPosition: lastTickPosition.current, currentPosition: position, duration })) {
        // The pass that just ended is its own listen, so the guard against
        // scrobbling one track twice is released for it.
        resetLastScrobbled();
        void scrobbleOutgoing(resource.song, Math.floor(lastTickPosition.current));
        session.markNewListen();
      }
      lastTickPosition.current = position;

      reportPlaybackProgress(resource.song, Math.floor(position * 1000), false);
      persistence.current.persistPosition(position);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [isPlaying, persistence, reportPlaybackProgress, resetLastScrobbled, scrobbleOutgoing, session]);

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
      currentIndex: session.currentIndex(),
      repeatMode: session.repeatMode(),
      shuffleMode: session.shuffleMode(),
    });
  }, [persistence, session, snapshot.queueVersion]);
}
