import { nanoid } from '@reduxjs/toolkit';

import type { PlexClient } from './client';
import { LIBRARY_IDENTIFIER } from './urlCommands';
import type { PlexResponse } from './types';

/**
 * Telling Plex what is playing.
 *
 * Plex's playback endpoints are not resources that take whatever they are
 * given: `/:/scrobble` and `/:/timeline` are the two calls Plex's own players
 * make, and the server answers a call it cannot act on with `200` and an empty
 * body — which this client reads as success. Yuzic sent both with parameters
 * missing, so every listen on a Plex server was accepted and dropped: no play
 * count, no last-played date, and nothing in the server's Now Playing while a
 * track ran.
 *
 * - `/:/scrobble` carried `key` and no `identifier`, and addressed the track
 *   by its metadata *path* rather than by its rating key. Every `/:/` call is
 *   scoped to the plugin that owns the item, and the music library is
 *   `com.plexapp.plugins.library`; without it the server has no provider to
 *   hand the key to.
 * - `/:/timeline` carried `ratingKey`, `state` and `time` — not `key`, not
 *   `duration`, not `identifier`. How far into a track an event is, is `time`
 *   read against `duration`, so an event with no duration is one the server
 *   cannot place: the session never appeared and the listen never landed.
 *
 * The parameter sets below are the ones the documented Plex clients send —
 * python-plexapi's `markPlayed` and `updateTimeline`, and Plex's own
 * `/:/scrobble` URL command. Nothing here is invented: where Yuzic has no
 * value that Plex would also take (`playQueueItemID`, for one — this app
 * makes no Plex play queues), the parameter is left out rather than filled
 * with a plausible-looking number.
 */

/** The three player states Plex's timeline takes; `buffering` is Plex's fourth and Yuzic never knows it. */
type PlexTimelineState = 'playing' | 'paused' | 'stopped';

/**
 * A track's "details key", `/library/metadata/{ratingKey}` — what `/:/timeline`
 * wants under `key`, beside the bare rating key it also wants under
 * `ratingKey`. They are two spellings of the same item and Plex asks for both.
 */
function metadataKey(ratingKey: string): string {
  return `/library/metadata/${ratingKey}`;
}

/**
 * Marking a track played.
 *
 * `key` here is the bare rating key, *not* the metadata path `/:/timeline`
 * takes — the two endpoints genuinely differ, which is how the path form
 * survived so long in a call that looked reasonable.
 */
export function scrobblePath(ratingKey: string): string {
  const params = new URLSearchParams({ key: ratingKey, identifier: LIBRARY_IDENTIFIER });
  return `/:/scrobble?${params.toString()}`;
}

/**
 * One timeline event. `duration` is left out when the track's length could not
 * be established, because a made-up length is worse than a missing one: Plex
 * decides what fraction of a track was heard from `time` against `duration`,
 * and a zero there would file every listen as a whole-track play.
 */
export function timelinePath(event: {
  ratingKey: string;
  state: PlexTimelineState;
  timeMs: number;
  durationMs?: number;
}): string {
  const params = new URLSearchParams({
    ratingKey: event.ratingKey,
    key: metadataKey(event.ratingKey),
    identifier: LIBRARY_IDENTIFIER,
    state: event.state,
    time: String(Math.max(0, Math.round(event.timeMs))),
  });
  if (event.durationMs != null && Number.isFinite(event.durationMs) && event.durationMs > 0) {
    params.set('duration', String(Math.round(event.durationMs)));
  }
  return `/:/timeline?${params.toString()}`;
}

function durationOf(response: PlexResponse): number | undefined {
  const track = response.MediaContainer?.Metadata?.[0];
  const ms = track?.duration ?? track?.Media?.[0]?.duration;
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/**
 * The playback reporter for one Plex adapter, holding the two things a single
 * `/:/timeline` call cannot work out for itself: which session it belongs to,
 * and how long the track is.
 */
export function createPlexPlaybackReporter(client: PlexClient) {
  /**
   * One playback session, as Plex counts them.
   *
   * `X-Plex-Client-Identifier` says which *install* is talking, and is the
   * same value for every play this app will ever make. It is
   * `X-Plex-Session-Identifier` that says which *play*, and it is what lets
   * the server gather a run of pings into one session and retire it when the
   * last one says `stopped`. Sending only the first — which is what the client
   * did — leaves every play this install makes indistinguishable from the one
   * before it.
   *
   * A fresh id per track, kept for that track's pings and dropped on `stopped`,
   * is exactly what a session is here: this app plays one thing at a time.
   */
  let session: { ratingKey: string; id: string } | null = null;

  /**
   * The current track's duration in milliseconds, asked of Plex once.
   *
   * This is the one thing the timeline needs that the adapter is never told.
   * `SongsApi.reportNowPlaying(songId)` and its two siblings take an id and
   * nothing else, while the domain `Song` the caller is already holding
   * carries `durationSeconds` — so this request buys back a value the app
   * knew and threw away at the contract boundary. Widening those three
   * signatures would delete this lookup entirely; that is a `ServerAdapter`
   * change, and deliberately not made from inside one adapter.
   *
   * Until then: one extra request per track, reused by every heartbeat that
   * follows it (one every ten seconds), and a failed ask is forgotten rather
   * than remembered as "unknown" — the same way `/identity` is — so the next
   * ping asks again instead of reporting the whole track without a duration.
   */
  let lookup: { ratingKey: string; durationMs: Promise<number | undefined> } | null = null;

  function durationMs(ratingKey: string): Promise<number | undefined> {
    if (lookup?.ratingKey === ratingKey) return lookup.durationMs;
    const entry: { ratingKey: string; durationMs: Promise<number | undefined> } = {
      ratingKey,
      durationMs: Promise.resolve(undefined),
    };
    entry.durationMs = client
      .request<PlexResponse>(`/library/metadata/${encodeURIComponent(ratingKey)}`)
      .then(durationOf)
      .catch(() => {
        if (lookup === entry) lookup = null;
        return undefined;
      });
    lookup = entry;
    return entry.durationMs;
  }

  function sessionId(ratingKey: string, state: PlexTimelineState): string {
    if (session?.ratingKey !== ratingKey) session = { ratingKey, id: nanoid() };
    const { id } = session;
    if (state === 'stopped') session = null;
    return id;
  }

  async function timeline(ratingKey: string, state: PlexTimelineState, timeMs: number): Promise<void> {
    // Taken before the duration is awaited, so a stop and the ping it races
    // still agree on which session they are ending.
    const headers = { 'X-Plex-Session-Identifier': sessionId(ratingKey, state) };
    await client.request(
      timelinePath({ ratingKey, state, timeMs, durationMs: await durationMs(ratingKey) }),
      { headers },
    );
  }

  return {
    scrobble: async (ratingKey: string): Promise<void> => {
      await client.request(scrobblePath(ratingKey));
    },
    nowPlaying: (ratingKey: string): Promise<void> => timeline(ratingKey, 'playing', 0),
    progress: (ratingKey: string, positionMs: number, paused: boolean): Promise<void> =>
      timeline(ratingKey, paused ? 'paused' : 'playing', positionMs),
    stop: (ratingKey: string, positionMs: number): Promise<void> => timeline(ratingKey, 'stopped', positionMs),
  };
}
