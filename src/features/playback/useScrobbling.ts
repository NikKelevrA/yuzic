import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { Song } from '@/domain/entities/Song';
import { recordListen } from '@/state/redux/slices/listeningSlice';
import { endingFrom } from '@/features/listening/listeningEvent';
import { relatedKey, entityKey } from '@/features/listening/listenerKey';
import {
  buildScrobbleMutation,
  type ScrobbleDestination,
} from '@/features/offline/offlineMutations';
import { enqueueOfflineMutationAction } from '@/state/redux/slices/offlineMutationsSlice';
import { isScrobbleable } from '@/domain/playback/ContentKind';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import {
  useScrobbleDestinationPlan,
  submitDirectListen,
  submitDirectNowPlaying,
} from '@/state/redux/selectors/scrobbleRoutingSelectors';
import { useApi } from '@/providers/registry/useApi';

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
 * `SongsApi` (`scrobble`, `reportNowPlaying`, `reportPlaybackProgress/Stop`
 * — each adapter implements only what its protocol needs),
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
  /*
   The last listen written to the history, as `track@startedAt`.

   `lastScrobbledIdRef` below cannot stand in for this. It is only *set* once
   a listen passes the scrobble threshold, so it does not guard a skip at all
   — and skips are precisely what the history records and scrobbling does not.
   A departure reported twice would otherwise be two events, which is a
   doubled play count and a halved completion rate for that track.

   Keyed by start time as well as track, so the same song played twice in one
   sitting is two listens, which it is.
  */
  const lastRecordedRef = useRef<string | null>(null);
  /*
   The track the player last failed on, if it has not been written down yet.

   `endingFrom` can only tell `finished` from `skipped`, because a position is
   all it has and a lost stream looks exactly like somebody pressing next. Only
   the error path knows the difference, so it says so here and the recording
   reads it.

   It matters more than it sounds. Without this every dropped stream is filed
   as a skip, and a skip past eight seconds is a *rejection* — so the listener
   whose connection drops has the app conclude they dislike whatever was
   playing when it did. That is precisely backwards, and it mislearns hardest
   about the people with the worst connections.
  */
  const interruptedIdRef = useRef<string | null>(null);

  const resetLastScrobbled = useCallback(() => {
    lastScrobbledIdRef.current = null;
    lastRecordedRef.current = null;
    interruptedIdRef.current = null;
  }, []);

  /** Told by the error path that this track did not end by choice. */
  const markInterrupted = useCallback((nativeId: string) => {
    interruptedIdRef.current = nativeId;
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
    if (!isScrobbleable(song.contentKind)) return;

    /*
     Written down *before* any threshold, and this ordering is the whole point.
     Everything below returns early — the already-scrobbled guard, then the
     half-a-track rule — and those early returns are exactly the listens worth
     knowing about: a track abandoned at twenty seconds is the strongest
     negative signal this app ever receives, and under the old counter it left
     no trace at all, because the only thing that wrote anything was the
     scrobble that a skip by definition never earns.

     Scrobbling reports a listen outward under somebody else's rules.
     `recordListen` writes down what happened, locally, under none. They share
     this trigger and nothing else.
    */
    const recordKey = `${song.nativeId}@${opts.startTime}`;
    if (activeServer?.id && lastRecordedRef.current !== recordKey) {
      lastRecordedRef.current = recordKey;
      const duration = song.durationSeconds || 0;
      const interrupted = interruptedIdRef.current === song.nativeId;
      interruptedIdRef.current = null;
      dispatch(recordListen({
        at: opts.startTime,
        track: entityKey(song),
        album: relatedKey(song, song.album.nativeId),
        artist: relatedKey(song, song.artist.nativeId),
        playlist: relatedKey(song, opts.playlistId),
        seconds: opts.listenedSeconds,
        duration,
        ending: interrupted ? 'interrupted' : endingFrom(opts.listenedSeconds, duration),
      }));
    }

    if (lastScrobbledIdRef.current === song.nativeId) return;
    const songDuration = song.durationSeconds || 0;
    if (!passesScrobbleThreshold(opts.listenedSeconds, songDuration)) return;
    lastScrobbledIdRef.current = song.nativeId;

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
    if (!isScrobbleable(song.contentKind)) return;
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

  return {
    scrobbleIfNeeded,
    submitNowPlaying,
    reportPlaybackProgress,
    resetLastScrobbled,
    markInterrupted,
  };
}
