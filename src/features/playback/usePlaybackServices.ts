import { useBookmarkManager } from './useBookmarkManager';
import { useLatestRef } from './useLatestRef';
import { usePlaybackPersistence } from './usePlaybackPersistence';
import { useQueueSync } from './useQueueSync';
import { useScrobbling } from './useScrobbling';

export type PlaybackServices = ReturnType<typeof usePlaybackServices>;

/**
 * What playback reports to and remembers with: scrobbling, bookmarks, the
 * server's queue mirror, and persisted resume state.
 *
 * Handed out as latest-value refs, so the controllers built once in the
 * engine reach the current instance of each without being rebuilt whenever
 * one of these hooks returns a new object.
 */
export function usePlaybackServices() {
  const { scrobbleIfNeeded, submitNowPlaying, reportPlaybackProgress, resetLastScrobbled } = useScrobbling();
  const scrobble = useLatestRef(scrobbleIfNeeded);
  const nowPlaying = useLatestRef(submitNowPlaying);
  const bookmarks = useLatestRef(useBookmarkManager());
  const queueSync = useLatestRef(useQueueSync());
  const persistence = useLatestRef(usePlaybackPersistence());

  return { scrobble, nowPlaying, bookmarks, queueSync, persistence, reportPlaybackProgress, resetLastScrobbled };
}
