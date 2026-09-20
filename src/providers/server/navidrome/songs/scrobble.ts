import { NavidromeClient } from "../client";

/**
 * When the listen began, in the form Subsonic takes it — or nothing at all.
 *
 * `time` is "the time (in milliseconds since 1 Jan 1970) at which the song was
 * listened to", and it is optional. The caller's start time comes from the
 * playback session's `listenStartedAt`, which is **0 when there is no listen in
 * progress** (`clearListen`), and a start time of 0 was being sent as
 * `time=0` — a listen dated 1 January 1970.
 *
 * That is not a harmless off-by-something. Navidrome files the play at the
 * timestamp it is given and forwards it on, and both destinations it forwards
 * to refuse a listen that old (Last.fm's submission window is a fortnight),
 * so the listen is lost in a way that looks like a delivered scrobble from
 * here: the server answered `ok`.
 *
 * Omitted rather than replaced with `Date.now()`, because an absent `time` is
 * not an error to paper over — the Subsonic spec makes it optional precisely
 * so the server can stamp the listen itself, which Navidrome does
 * (`scrobblerSubmit` falls back to `time.Now()`). The listen is being reported
 * seconds after it ended, so the server's clock is as true as ours here, and
 * it is the one clock both the play count and any forwarded scrobble agree on.
 */
function listenedAt(timestamp: number): { time?: number } {
  return Number.isFinite(timestamp) && timestamp > 0 ? { time: timestamp } : {};
}

export async function scrobble(
  client: NavidromeClient,
  songId: string,
  timestamp: number
): Promise<void> {
  await client.request('scrobble.view', { id: songId, ...listenedAt(timestamp), submission: 'true' });
}

/**
 * The same endpoint with `submission=false` — Subsonic's "now playing", not a
 * completed listen. Navidrome forwards it to Last.fm/ListenBrainz for users
 * who configured that server-side.
 */
export async function nowPlaying(
  client: NavidromeClient,
  songId: string
): Promise<void> {
  await client.request('scrobble.view', { id: songId, submission: 'false' });
}
