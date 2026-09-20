import type { MediaBrowserClient } from '../client';

// Jellyfin's tick unit is 100-nanosecond intervals — a track at 42 seconds is
// 42 * 10_000_000 ticks. Server-side scrobbler plugins (last.fm, listenbrainz)
// listen for these session events, so a scrobble to Last.fm through Jellyfin
// starts here.
const MS_TO_TICKS = 10_000;

function ticksFromMs(ms: number): number {
  return Math.max(0, Math.floor(ms) * MS_TO_TICKS);
}

export async function reportPlaybackStart(
  client: MediaBrowserClient,
  itemId: string,
  positionMs: number
): Promise<void> {
  await client.request('/Sessions/Playing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ItemId: itemId,
      PositionTicks: ticksFromMs(positionMs),
      IsPaused: false,
      PlayMethod: client.playMethodFor(itemId),
    }),
  });
}

export async function reportPlaybackProgress(
  client: MediaBrowserClient,
  itemId: string,
  positionMs: number,
  isPaused: boolean
): Promise<void> {
  await client.request('/Sessions/Playing/Progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ItemId: itemId,
      PositionTicks: ticksFromMs(positionMs),
      IsPaused: isPaused,
      PlayMethod: client.playMethodFor(itemId),
      EventName: isPaused ? 'Pause' : 'TimeUpdate',
    }),
  });
}

/**
 * The end of a playback session, and the single most consequential request in
 * this file.
 *
 * Three separate things happen on the server when this lands, and they are
 * worth naming because the app's own behaviour was built on a guess about two
 * of them (verified against jellyfin 10.8.13 / 10.9.11 / 10.10.0 — the code
 * below is identical across all three):
 *
 *  1. **The session closes.** `NowPlayingItem` clears. Withhold this and the
 *     server shows the listener as still playing a track they left, for as
 *     long as the session lives.
 *  2. **The scrobbler plugins fire.** Both the Last.fm plugin and the
 *     ListenBrainz plugin subscribe to `ISessionManager.PlaybackStopped` and
 *     scrobble from `PositionTicks` alone — at or past 50% of the runtime, or
 *     at or past four minutes. Neither reads the played flag, and neither sees
 *     `PlayedItems`, which raises `UserDataSaved`/`TogglePlayed` instead. On a
 *     Jellyfin or Emby server, *this request is the scrobble*.
 *  3. **`UpdatePlayState` runs.** Past 90% of the runtime — or on any item
 *     shorter than five minutes that is past 5% — the item is marked played.
 *     Note what does *not* happen: `PlayCount` is untouched here. Jellyfin
 *     increments the play count on `/Sessions/Playing`, at position zero,
 *     which is worth knowing before anyone goes looking for a doubled count.
 *
 * `PositionTicks` is a *position* — where the playhead was — and is sent as
 * one. It is tempting to send listened time instead, because the plugins'
 * 50%/4-minute rule is Last.fm's rule and Last.fm's rule is about time played.
 * Resist it: this field also decides the played flag and the resume point, and
 * every other client on the server puts a position in it. Yuzic's own
 * scrobble decision uses real listened time (see `listenMeter`); the server's
 * plugins get the position their rule was written against. The two can
 * disagree for a listener who rewound, and that is the honest outcome rather
 * than lying about where the playhead was.
 */
export async function reportPlaybackStop(
  client: MediaBrowserClient,
  itemId: string,
  positionMs: number
): Promise<void> {
  await client.request('/Sessions/Playing/Stopped', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ItemId: itemId,
      PositionTicks: ticksFromMs(positionMs),
    }),
  });
}

/**
 * Clears the server-side resume position by sending a Stopped event at
 * position 0. Used when a track finishes (or the app decides it's finished)
 * so the "Continue Watching" surface stops offering to resume it.
 *
 * Position zero is also what keeps this from scrobbling: the plugins' rule is
 * a percentage of the runtime, and zero is below every threshold there is.
 */
export async function clearPlaybackPosition(
  client: MediaBrowserClient,
  itemId: string
): Promise<void> {
  await reportPlaybackStop(client, itemId, 0);
}
