import type { TrackTotals } from '@/state/redux/slices/listeningSlice';

/**
 * How much somebody likes a track, and whether they still do.
 *
 * A play count answers neither. It cannot tell a record played forty times
 * last month from one played forty times in 2021 and never since, and those
 * are opposite facts about a listener — the first is what they are into, the
 * second is the single best thing the app could put in front of them. Nor can
 * it tell forty plays from forty *starts*, thirty of which were skipped at
 * fifteen seconds.
 *
 * Both fall out of the same three components, which is why they live in one
 * file: a magnitude, a recency, and a quality. Affinity multiplies by recency;
 * dormancy multiplies by its complement.
 */

/**
 * How long until a listen counts for half of what it did.
 *
 * Six months. Long enough that a record loved last winter is still clearly
 * loved, short enough that a year of silence is unmistakable. Exponential
 * rather than a cliff because taste does not have edges, and a threshold at
 * any particular age would make a shelf's contents jump on an arbitrary day.
 */
export const AFFINITY_HALF_LIFE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 1 for a listen happening now, 0.5 at the half-life, approaching 0.
 *
 * Clamped at both ends. A `lastAt` in the future — a device whose clock is
 * wrong, or a server timestamp from a machine in another timezone — would
 * otherwise produce a weight above 1 and rank a track above everything real.
 */
export function recencyWeight(lastAt: number, now: number): number {
  if (lastAt <= 0) return 0;
  const ageDays = Math.max(0, (now - lastAt) / DAY_MS);
  return Math.pow(0.5, ageDays / AFFINITY_HALF_LIFE_DAYS);
}

/**
 * The share of starts the listener chose to abandon early.
 *
 * Zero when nothing is known — a seeded row from the old counters has starts
 * but no recorded rejections, and treating that absence as "never skipped"
 * would flatter it. It contributes nothing either way until real events
 * arrive, which is the honest reading of data that predates the measurement.
 */
export function rejectionRate(totals: TrackTotals): number {
  if (totals.starts <= 0) return 0;
  return Math.min(1, totals.rejections / totals.starts);
}

/**
 * A multiplier in 0.2..1 for how well the track is actually received.
 *
 * Floored well above zero on purpose. A track skipped every time is still a
 * track somebody put in their library and keeps starting, and driving its
 * score to zero would erase it from every surface — including the ones meant
 * to ask whether they still want it. The floor keeps it ranked last rather
 * than ranked away.
 */
export function listenQuality(totals: TrackTotals): number {
  return Math.max(0.2, 1 - rejectionRate(totals));
}

/**
 * What the listener is into *now*.
 *
 * Use for "most played", "top artists", seeds, and anywhere a shelf means
 * "more of this". Plays rather than starts, so a skipped track does not climb
 * by being skipped often.
 */
export function affinity(totals: TrackTotals, now: number): number {
  return totals.plays * listenQuality(totals) * recencyWeight(totals.lastAt, now);
}

/**
 * What the listener loved and has stopped playing.
 *
 * The rediscovery score, and the one thing in here that a streaming service
 * structurally cannot compute: it needs a long tail the listener owns, and a
 * history of them loving it. Spotify has neither.
 *
 * Deliberately requires real evidence of past love — the `plays` term — so
 * this ranks *forgotten favourites* rather than the merely unplayed. Things
 * never played at all are a different surface with a different question
 * behind it (`neverPlayed`), because "you loved this and stopped" and "you
 * have never opened this" want different words on screen.
 */
export function dormancy(totals: TrackTotals, now: number): number {
  const forgotten = 1 - recencyWeight(totals.lastAt, now);
  return totals.plays * listenQuality(totals) * forgotten;
}

/** Days since the last listen, or null when there has never been one. */
function daysSince(lastAt: number, now: number): number | null {
  if (lastAt <= 0) return null;
  return Math.max(0, Math.floor((now - lastAt) / DAY_MS));
}

/**
 * The sentence a rediscovery shelf puts under a title.
 *
 * Returned as parts rather than a string because the app translates into four
 * locales and a formatted English sentence would not survive the trip. The
 * point is the same either way: *"you played this 47 times, and not for two
 * years"* is a fact about that person, checkable by them, and it is worth
 * more than any amount of "because you like indie". Every number here comes
 * from their own history, which is also why nothing in this file needs a
 * network, an account, or anybody else's listening.
 */
export interface DormancyReason {
  plays: number;
  daysSinceLastPlay: number | null;
  lastPlayedAt: number;
}

export function dormancyReason(totals: TrackTotals, now: number): DormancyReason {
  return {
    plays: totals.plays,
    daysSinceLastPlay: daysSince(totals.lastAt, now),
    lastPlayedAt: totals.lastAt,
  };
}

/**
 * Rank entries by a score, dropping the ones that score nothing.
 *
 * Shared by every shelf here so they cannot disagree about ties or about what
 * "empty" means. A zero score is always excluded: for affinity it means never
 * played or long gone, for dormancy it means played today — and in both cases
 * the entry is not an answer to the question being asked, so padding a shelf
 * with it would be worse than showing a shorter shelf.
 */
export function rankBy<T>(
  entries: readonly T[],
  score: (entry: T) => number,
  limit: number,
): T[] {
  return entries
    .map(entry => ({ entry, score: score(entry) }))
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(scored => scored.entry);
}
