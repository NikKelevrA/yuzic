import {
  completionOf,
  countsAsPlay,
  hourOf,
  isRejection,
  weekdayOf,
  type ListenEvent,
} from './listeningEvent';
import type { TrackTotals } from '@/state/redux/slices/listeningSlice';

/**
 * The figures a listener is shown about their own listening.
 *
 * Two rules run through all of it, and they are the difference between this
 * and a Wrapped.
 *
 * **Every number is checkable.** "You played this 47 times" is a fact the
 * person can verify and argue with. "Your taste is 68% obscure" is not, and
 * an audience that self-hosts partly to stop being characterised by software
 * will notice which one they have been handed. Nothing here interprets, rates
 * or scores the listener — it counts what happened. Spotify's 2024 Wrapped
 * lost a lot of goodwill on exactly this line, and it had better data than we
 * do.
 *
 * **It is all local.** Every figure comes from this device's own log. That is
 * a constraint — no cross-device merge, no server truth — and also the feature:
 * it works offline, it needs no account, and nothing left the phone to produce
 * it. Where a server has its own play counts they stay where they are, in
 * `statsSlice`, because they answer a different question and disagree for
 * good reasons.
 *
 * Keys, not names. Everything here returns `serverId:entityId` and counts; the
 * caller resolves them against the catalog. That keeps this file pure, free of
 * the query layer, and testable with a handful of literals.
 */

export interface Tally {
  key: string;
  plays: number;
  seconds: number;
}

export interface ListeningSummary {
  /** Listens that passed the play threshold. */
  plays: number;
  /** Every start, including skipped ones. */
  starts: number;
  seconds: number;
  /** Distinct tracks, albums and artists touched in the window. */
  tracks: number;
  albums: number;
  artists: number;
  /** Sittings, as `sessionFor` divided them. */
  sessions: number;
  /** Share of starts abandoned early, 0..1. */
  skipRate: number;
  /** Plays per hour of day, index 0..23. */
  byHour: number[];
  /** Plays per weekday, index 0 = Sunday. */
  byWeekday: number[];
  topTracks: Tally[];
  topAlbums: Tally[];
  topArtists: Tally[];
}

const EMPTY: ListeningSummary = {
  plays: 0,
  starts: 0,
  seconds: 0,
  tracks: 0,
  albums: 0,
  artists: 0,
  sessions: 0,
  skipRate: 0,
  byHour: Array(24).fill(0),
  byWeekday: Array(7).fill(0),
  topTracks: [],
  topAlbums: [],
  topArtists: [],
};

function tallyTop(counts: Map<string, Tally>, limit: number): Tally[] {
  return [...counts.values()]
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, limit);
}

function bump(counts: Map<string, Tally>, key: string, played: boolean, seconds: number): void {
  const entry = counts.get(key) ?? { key, plays: 0, seconds: 0 };
  if (played) entry.plays += 1;
  entry.seconds += seconds;
  counts.set(key, entry);
}

/**
 * Summarise a window of the log.
 *
 * `since` filters by when the listen started. Pass 0 for everything the ring
 * still holds — which is *not* all time, and callers showing an all-time
 * figure should read `totals` instead. Getting that wrong would show a number
 * that silently shrinks as old events are evicted, which is the failure this
 * whole design is arranged to avoid.
 */
export function summarise(
  events: readonly ListenEvent[],
  options: { since?: number; limit?: number } = {},
): ListeningSummary {
  const { since = 0, limit = 10 } = options;
  const window = since > 0 ? events.filter(event => event.at >= since) : events;
  if (window.length === 0) return { ...EMPTY, byHour: Array(24).fill(0), byWeekday: Array(7).fill(0) };

  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const trackCounts = new Map<string, Tally>();
  const albumCounts = new Map<string, Tally>();
  const artistCounts = new Map<string, Tally>();
  const sessions = new Set<number>();

  let plays = 0;
  let seconds = 0;
  let rejections = 0;

  for (const event of window) {
    const played = countsAsPlay(event);
    seconds += event.seconds;
    sessions.add(event.session);
    if (played) plays += 1;
    if (isRejection(event)) rejections += 1;

    // Histograms count *plays*, not starts: an hour spent skipping is not an
    // hour of listening, and a clock face that says otherwise is wrong in the
    // way a listener would notice first.
    if (played) {
      byHour[hourOf(event)] += 1;
      byWeekday[weekdayOf(event)] += 1;
    }

    bump(trackCounts, event.track, played, event.seconds);
    if (event.album) bump(albumCounts, event.album, played, event.seconds);
    if (event.artist) bump(artistCounts, event.artist, played, event.seconds);
  }

  return {
    plays,
    starts: window.length,
    seconds,
    tracks: trackCounts.size,
    albums: albumCounts.size,
    artists: artistCounts.size,
    sessions: sessions.size,
    skipRate: window.length > 0 ? rejections / window.length : 0,
    byHour,
    byWeekday,
    topTracks: tallyTop(trackCounts, limit),
    topAlbums: tallyTop(albumCounts, limit),
    topArtists: tallyTop(artistCounts, limit),
  };
}

/**
 * Lifetime figures, from the rollups rather than the events.
 *
 * These are the ones safe to label "all time". `totals` is never evicted, so
 * they only ever grow — unlike anything derived from the ring, which loses its
 * tail as it wraps.
 */
export function lifetimeTotals(totals: Record<string, TrackTotals>): {
  plays: number;
  starts: number;
  seconds: number;
  tracks: number;
  since: number;
} {
  let plays = 0;
  let starts = 0;
  let seconds = 0;
  let since = 0;

  for (const entry of Object.values(totals)) {
    plays += entry.plays;
    starts += entry.starts;
    seconds += entry.seconds;
    if (entry.firstAt > 0 && (since === 0 || entry.firstAt < since)) since = entry.firstAt;
  }

  return { plays, starts, seconds, tracks: Object.keys(totals).length, since };
}

/**
 * Consecutive days, ending today or yesterday, on which something was played.
 *
 * Yesterday counts as still running, because a streak that breaks at midnight
 * punishes somebody for not having listened yet this morning — which is a
 * number designed to nag rather than to describe. Days are local dates, so the
 * boundary is the listener's midnight rather than UTC's.
 */
export function listeningStreak(events: readonly ListenEvent[], now: number): number {
  if (events.length === 0) return 0;

  const days = new Set<string>();
  for (const event of events) {
    if (countsAsPlay(event)) days.add(localDayKey(event.at));
  }
  if (days.size === 0) return 0;

  const DAY = 24 * 60 * 60 * 1000;
  let cursor = now;
  if (!days.has(localDayKey(cursor))) {
    cursor -= DAY;
    if (!days.has(localDayKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor -= DAY;
  }
  return streak;
}

function localDayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Tracks heard for the first time within the window.
 *
 * "First" means first in the log, so on a fresh install everything is new for
 * a while. Correct rather than flattering: the app genuinely does not know
 * what was played before it started watching, and inventing a history would
 * make every other figure here untrustworthy by association.
 */
export function firstHeardIn(
  totals: Record<string, TrackTotals>,
  since: number,
  until: number = Number.MAX_SAFE_INTEGER,
): string[] {
  return Object.entries(totals)
    .filter(([, entry]) => entry.firstAt >= since && entry.firstAt < until)
    .sort((a, b) => a[1].firstAt - b[1].firstAt)
    .map(([key]) => key);
}

/**
 * Average completion across the window, 0..1 — how much of things gets heard.
 *
 * Live radio and anything else with no duration is excluded rather than
 * counted as zero; a stream has no proportion to be through, and including it
 * would drag the figure down in proportion to how much radio somebody listens
 * to, which says nothing about their attention.
 */
export function averageCompletion(events: readonly ListenEvent[]): number {
  const measurable = events.filter(event => event.duration > 0);
  if (measurable.length === 0) return 0;
  const total = measurable.reduce((sum, event) => sum + completionOf(event), 0);
  return total / measurable.length;
}
