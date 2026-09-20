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
import { resetListen, takeFinishedListen } from './listenMeter';
import { clearListenCheckpointFor } from './listenCheckpoint';

/**
 * The shortest track anyone will accept a scrobble for.
 *
 * Thirty seconds, which is Last.fm's rule and ListenBrainz's recommendation,
 * and it is a rule about the *track*, not about the listen. Without it the
 * threshold below does something quietly absurd: a ten-second interlude needs
 * five seconds to "pass", so every album's spoken-word intro scrobbled itself
 * on the way past, and every one of those submissions was then thrown away at
 * the far end. The app reported a play, the service recorded nothing, and the
 * two disagreed forever with nothing to point at.
 *
 * A track whose duration the server never told us is not "too short" — it is
 * unknown, and the four-minute arm of the threshold is what handles it.
 */
const MIN_SCROBBLE_DURATION_SECONDS = 30;

function passesScrobbleThreshold(listenedSeconds: number, durationSeconds: number): boolean {
  const duration = Number(durationSeconds) || 0;
  if (duration > 0 && duration < MIN_SCROBBLE_DURATION_SECONDS) return false;
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
 *
 * **Session reporting stays behind the same switch, and that is a decision.**
 * It is tempting to read now-playing, progress and stop as three capabilities
 * unrelated to scrobbling — session presence in the server's dashboard,
 * cross-device resume — that a listener should keep after turning scrobbling
 * off. On a Subsonic server that reading would be right. On Jellyfin and Emby
 * it is wrong in the one way that matters: the session events *are* the
 * scrobble there. Both the Last.fm plugin and the ListenBrainz plugin
 * subscribe to `PlaybackStopped` and submit from its `PositionTicks` alone.
 * Sending session events "because they aren't scrobbling" would scrobble, to
 * Last.fm, for a listener who had switched scrobbling off. There is no way to
 * send half of it.
 *
 * Nor is the rest of it a lesser ask. "Show me as playing in my server's
 * dashboard" names the track, the artist and the listener, live, to whoever
 * administers that server. Someone who turned scrobbling off is plainly not
 * asking for that either, and the app has no business deciding otherwise on
 * their behalf. If it is ever wanted it is a switch of its own, with its own
 * words on the Settings screen — not a capability that arrives because a
 * different switch was read generously.
 *
 * What that costs is smaller than it looks. Resume position does not ride on
 * this: `useBookmarkManager` writes it through `api.bookmarks` under the
 * "Resume long tracks" setting, which is untouched by any of this.
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
  /*
   The track the server currently believes this device is playing, if any.

   This is the whole fix for the incident. `Stopped` used to be sent from
   inside the scrobble's success branch, after `markPlayed` — so a skip below
   the threshold sent none, a pause-and-kill sent none, and switching
   scrobbling off part-way through a track sent none. The server was left
   holding a `NowPlayingItem` for a song nobody was playing, its
   `PlaybackPositionTicks` frozen at the last tick it heard, and — because the
   Last.fm and ListenBrainz plugins scrobble on `PlaybackStopped` and on
   nothing else — the listen that *did* earn a scrobble on a skip-heavy queue
   never reached the destination at all.

   The rule now is symmetry rather than a second condition: whatever opened a
   session closes it. If `submitNowPlaying` announced a track, its departure
   sends `Stopped`, whatever the threshold said, whether or not `markPlayed`
   ran, and even if the routing changed underneath in between. If nothing was
   announced — scrobbling is off, so no session was ever opened — there is
   nothing to close, and the app does not reach for the server on the way out
   of a track the user asked it not to report.
  */
  const openSessionIdRef = useRef<string | null>(null);

  const resetLastScrobbled = useCallback(() => {
    lastScrobbledIdRef.current = null;
    lastRecordedRef.current = null;
    interruptedIdRef.current = null;
    // A new listen starts here; none of the last one's heard time carries in.
    resetListen();
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
  /**
   * Tells the server this device has stopped playing a track it announced.
   *
   * Unconditional with respect to every decision above it, and deliberately
   * the last thing to happen on a departure: when a listen *did* earn
   * `markPlayed`, that call runs first, because it resets the server's stored
   * position and would otherwise wipe the position this report just wrote.
   *
   * `positionSeconds` is the playhead — where the listener actually was — not
   * how much of the track they heard. The two diverge the moment anyone seeks
   * backwards, and this field is a position on the server too: it decides the
   * resume point and, past ninety percent, the played flag.
   */
  const closeServerSession = useCallback(async (song: Song, positionSeconds: number) => {
    if (openSessionIdRef.current !== song.nativeId) return;
    openSessionIdRef.current = null;
    // Fire-and-forget by design: nothing the listener can see depends on it,
    // and a failure here must not stop the next track from starting.
    await api.songs.reportPlaybackStop?.(song.nativeId, Math.max(0, positionSeconds) * 1000)
      .catch(() => {});
  }, [api]);

  const scrobbleIfNeeded = useCallback(async (
    song: Song | null,
    /**
     * `listenedSeconds` is, despite its name, the playhead at departure: every
     * producer passes a position (`transportController`'s `position()`, the
     * coordinator's `getOutgoingProgress()`, the heartbeat's last tick). The
     * name is load-bearing elsewhere — `outgoingScrobble` builds this object —
     * so it is documented here rather than renamed under a caller that a
     * different change owns. How much was *heard* comes from `listenMeter`.
     */
    opts: { listenedSeconds: number; startTime: number; playlistId?: string }
  ) => {
    if (!song) return;
    // A live radio stream isn't a discrete listen — nothing to record. Podcast
    // episodes still scrobble; a finished episode is a listen the same way a
    // finished track is.
    if (!isScrobbleable(song.contentKind)) return;

    const leftAtSeconds = Math.max(0, Math.floor(opts.listenedSeconds));
    /*
     Two quantities, because `ListenEvent.seconds` was always documented as one
     of them and always delivered the other.

     `leftAtSeconds` answers "where was the playhead" — which is what decides
     whether the track ran out, where to resume, and what to put in
     `PositionTicks`. `listenedSeconds` answers "how much did they hear",
     which is what every scrobble threshold in the world is written against.
     They are the same number until somebody seeks backwards, and then they are
     not: three and a half minutes of a four-minute track, left at 1:00, is a
     playhead of 60 against a threshold of 120, and no scrobble for a track
     heard nearly twice through.

     The fallback is the playhead rather than zero, so a departure the meter
     never saw behaves exactly as it did before the meter existed.
    */
    const listenedSeconds = takeFinishedListen(song.nativeId) ?? leftAtSeconds;

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
        // The heard time, which is what this field has always claimed to be.
        seconds: listenedSeconds,
        duration,
        // The playhead, which is the only thing that can answer "did it run
        // out". Someone who rewound and skipped has heard the whole track and
        // still left early; that is a skip, and feeding heard time in here
        // would file it as `finished`.
        ending: interrupted ? 'interrupted' : endingFrom(leftAtSeconds, duration),
      }));
    }

    const songDuration = song.durationSeconds || 0;

    /**
     * The outward report, with all of its reasons not to happen.
     *
     * Separated from its caller so that every `return` in here is visibly a
     * decision about *scrobbling* and not about the departure. The session
     * stop below used to live inside this block's success branch, which is
     * how it inherited every one of these early exits.
     */
    const submitEarnedScrobble = async (): Promise<void> => {
      if (lastScrobbledIdRef.current === song.nativeId) return;
      if (!passesScrobbleThreshold(listenedSeconds, songDuration)) return;
      lastScrobbledIdRef.current = song.nativeId;

      if (plan.server) {
        try {
          // Awaited, and before the session stop: `markPlayed` resets the
          // server's stored position, so running it after the stop would
          // throw away the position that stop just reported.
          await api.songs.scrobble(song.nativeId, opts.startTime);
        } catch {
          queueScrobble('server', song, opts.startTime, songDuration, listenedSeconds);
        }
      }

      if (plan.direct) {
        try {
          await submitDirectListen(plan.direct.config, {
            artist: song.artist.name,
            track: song.title,
            listenedAt: Math.floor(opts.startTime / 1000),
            durationSeconds: songDuration > 0 ? songDuration : undefined,
            durationPlayedSeconds: listenedSeconds,
            album: song.album.title,
          });
        } catch {
          queueScrobble(plan.direct.kind, song, opts.startTime, songDuration, listenedSeconds);
        }
      }
    };

    await submitEarnedScrobble();
    await closeServerSession(song, leftAtSeconds);
    // Reported, so there is nothing left for the next launch to finish.
    clearListenCheckpointFor(song.nativeId, opts.startTime);
  }, [activeServer, plan, dispatch, api, queueScrobble, closeServerSession]);

  const submitNowPlaying = useCallback((song: Song) => {
    // Live streams don't have a "now playing this track" identity — the
    // server would either reject an empty-duration nowPlaying or record it
    // as an odd zero-length listen. Skip the whole path for them.
    if (!isScrobbleable(song.contentKind)) return;
    const songDuration = song.durationSeconds || undefined;

    // Fire-and-forget: a report outage should never block the player. Each
    // adapter decides what "now playing" means for its own protocol.
    if (plan.server) {
      // Recorded before the call rather than after it succeeds. A start that
      // failed in transit can still have reached the server, and a session
      // left open because the app decided the request had not happened is the
      // exact failure being fixed here. Closing a session that was never
      // opened costs one request the server ignores; the other way round costs
      // a listener who is shown as playing a track they left an hour ago.
      openSessionIdRef.current = song.nativeId;
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

  /** Whether the server currently believes this device is playing something. */
  const hasOpenServerSession = useCallback(() => openSessionIdRef.current !== null, []);

  /**
   * Take ownership of a session this process did not open.
   *
   * Only the checkpoint replay uses it: the session belongs to a run of the
   * app that is gone, and the departure about to be reported has to be allowed
   * to close it. Everything else opens its own sessions through
   * `submitNowPlaying` and has no business here.
   */
  const adoptOpenServerSession = useCallback((songId: string) => {
    openSessionIdRef.current = songId;
  }, []);

  return {
    scrobbleIfNeeded,
    submitNowPlaying,
    reportPlaybackProgress,
    resetLastScrobbled,
    markInterrupted,
    hasOpenServerSession,
    adoptOpenServerSession,
  };
}
