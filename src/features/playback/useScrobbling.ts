import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { Song } from '@/domain/entities/Song';
import { incrementPlay } from '@/state/redux/slices/statsSlice';
import {
  buildScrobbleMutation,
  type ScrobbleDestination,
} from '@/utils/offline/offlineMutations';
import { enqueueOfflineMutationAction } from '@/state/redux/slices/offlineMutationsSlice';
import { canScrobble } from '@/utils/playback/contentKind';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import {
  useScrobbleDestinationPlan,
  submitDirectListen,
  submitDirectNowPlaying,
} from '@/state/redux/selectors/scrobbleRoutingSelectors';
import { useApi } from '@/api';

function passesScrobbleThreshold(listenedSeconds: number, durationSeconds: number): boolean {
  const duration = Number(durationSeconds) || 0;
  const threshold = duration > 0 ? Math.min(Math.floor(duration * 0.5), 4 * 60) : 4 * 60;
  return listenedSeconds >= threshold;
}

/**
 * Session policy for scrobbling: decides WHEN a listen has happened (the
 * threshold rule below) and WHERE it goes — at most one of the two branches
 * a `ScrobbleDestinationPlan` can carry, so a listen is never double-
 * reported. It knows nothing about how any particular server or destination
 * is actually told: the active server's own semantics live behind
 * `SongsApi` (`scrobble`, `reportNowPlaying`, `reportPlaybackStart/
 * Progress/Stop` — each adapter implements only what its protocol needs),
 * and the plan's 'direct' branch is submitted through
 * `submitDirectListen`/`submitDirectNowPlaying`, both owned by
 * `scrobbleRoutingSelectors` alongside the routing rules themselves.
 */
export function useScrobbling() {
  const api = useApi();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const plan = useScrobbleDestinationPlan();

  const lastScrobbledIdRef = useRef<string | null>(null);

  const resetLastScrobbled = useCallback(() => {
    lastScrobbledIdRef.current = null;
  }, []);

  /**
   * Parks a failed scrobble in the offline queue instead of dropping it. Each
   * destination is queued on its own, so one destination's outage never
   * re-submits to a destination that already accepted the play.
   */
  const queueScrobble = useCallback((
    destination: ScrobbleDestination,
    song: Song,
    startTime: number,
    durationSeconds: number,
    listenedSeconds: number
  ) => {
    if (!activeServer?.id) return;
    dispatch(enqueueOfflineMutationAction(buildScrobbleMutation({
      serverId: activeServer.id,
      destination,
      songId: song.nativeId,
      artist: song.artist.name,
      track: song.title,
      album: song.album.title,
      startedAt: startTime,
      durationSeconds,
      listenedSeconds,
    })));
  }, [activeServer, dispatch]);

  /**
   * Records a finished listen, once it is long enough to count.
   *
   * `playlistId` is the collection the queue position came from, when it was a
   * playlist. A playlist play used to be counted by the playlist screen's own
   * play button at the moment it was pressed, which meant it was the only way
   * a playlist ever counted as played — starting one from Home's shelf, an
   * options sheet or search left its last-played untouched, so a playlist you
   * played constantly never rose in the shelf ranking by it. Attributing it
   * here instead makes every entry point count, and only once the listen
   * actually happened.
   */
  const scrobbleIfNeeded = useCallback(async (
    song: Song | null,
    opts: { listenedSeconds: number; startTime: number; playlistId?: string }
  ) => {
    if (!song) return;
    // A live radio stream isn't a discrete listen — nothing to record. Podcast
    // episodes still scrobble; a finished episode is a listen the same way a
    // finished track is.
    if (!canScrobble(song)) return;
    if (lastScrobbledIdRef.current === song.nativeId) return;
    const songDuration = song.durationSeconds || 0;
    if (!passesScrobbleThreshold(opts.listenedSeconds, songDuration)) return;
    lastScrobbledIdRef.current = song.nativeId;

    if (activeServer?.id) {
      dispatch(incrementPlay({
        serverId: activeServer.id,
        songId: song.nativeId,
        albumId: song.album.nativeId,
        artistId: song.artist.nativeId,
        playlistId: opts.playlistId,
      }));
    }

    if (plan.server) {
      try {
        await api.songs.scrobble(song.nativeId, opts.startTime);
        // Some adapters need an explicit session-stop call to fully register
        // the listen beyond `scrobble()` itself; it's optional on `SongsApi`
        // and each adapter implements it only where its protocol needs it,
        // so this is a no-op wherever it isn't. Fire-and-forget: a failed
        // report here is not user-visible and the scrobble itself already
        // succeeded.
        api.songs.reportPlaybackStop?.(song.nativeId, opts.listenedSeconds * 1000).catch(() => {});
      } catch {
        queueScrobble('server', song, opts.startTime, songDuration, opts.listenedSeconds);
      }
    }

    if (plan.direct) {
      try {
        await submitDirectListen(plan.direct.config, {
          artist: song.artist.name,
          track: song.title,
          listenedAt: Math.floor(opts.startTime / 1000),
          durationSeconds: songDuration > 0 ? songDuration : undefined,
          durationPlayedSeconds: opts.listenedSeconds,
          album: song.album.title,
        });
      } catch {
        queueScrobble(plan.direct.kind, song, opts.startTime, songDuration, opts.listenedSeconds);
      }
    }
  }, [activeServer, plan, dispatch, api, queueScrobble]);

  const submitNowPlaying = useCallback((song: Song) => {
    // Live streams don't have a "now playing this track" identity — the
    // server would either reject an empty-duration nowPlaying or record it
    // as an odd zero-length listen. Skip the whole path for them.
    if (!canScrobble(song)) return;
    const songDuration = song.durationSeconds || undefined;

    // Fire-and-forget: a report outage should never block the player. Each
    // adapter decides what "now playing" means for its own protocol.
    if (plan.server) {
      api.songs.reportNowPlaying?.(song.nativeId).catch(() => {});
    }

    if (plan.direct) {
      submitDirectNowPlaying(plan.direct.config, {
        artist: song.artist.name,
        track: song.title,
        durationSeconds: songDuration,
        album: song.album.title,
      }).catch(() => {});
    }
  }, [plan, api]);

  /**
   * Keeps a server-side playback session alive on adapters that implement
   * one — an optional `SongsApi` capability, skipped wherever it isn't
   * implemented. Fire-and-forget; a failed ping is not user-visible.
   */
  const reportPlaybackProgress = useCallback((song: Song, positionMs: number, isPaused: boolean) => {
    if (!plan.server) return;
    api.songs.reportPlaybackProgress?.(song.nativeId, positionMs, isPaused).catch(() => {});
  }, [plan, api]);

  return { scrobbleIfNeeded, submitNowPlaying, reportPlaybackProgress, resetLastScrobbled };
}
