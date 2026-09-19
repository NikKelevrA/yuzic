import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import { listenQuality } from './listeningAffinity';

/**
 * A shuffle that has noticed what the listener skips.
 *
 * Smart Shuffle mixes the rest of the queue with freshly fetched tracks and
 * shuffles the lot with Fisher–Yates — a uniform shuffle, which is to say it
 * knows nothing. A track abandoned eleven times out of twelve is as likely to
 * land first as one never skipped, in the feature with "smart" in its name.
 *
 * **What this is not.** It is not a ranking and not a filter. A shuffle has a
 * contract: every track is present, and the order is different each time. Both
 * hold here. What changes is only *how likely* a track is to land early, and
 * even a track skipped every single time keeps a real chance of coming first —
 * see `listenQuality`'s floor. A shuffle that always put the same thing first
 * would not be a shuffle, and one that quietly dropped tracks would be a lie.
 *
 * **Only the negative signal is used**, deliberately. Weighting by affinity
 * would pull a listener's favourites forward every time they shuffle, which is
 * the narrowing that turns a large library into a small one — the same reason
 * the autoplay ranker has no familiarity term. Knowing that something gets
 * skipped is useful; acting on what gets played most is not.
 *
 * Uniform when nothing is known, so a fresh install behaves exactly as before.
 */

/**
 * Weighted sampling without replacement, by Efraimidis and Spirakis.
 *
 * Each item draws a key of `random ^ (1 / weight)` and the items are ordered by
 * it. Higher weights tend to draw higher keys, so they tend to come first — and
 * the result is a genuine random permutation for any weights, rather than a
 * sort with noise added, which is the usual way this gets written and is not
 * the same thing.
 *
 * `random` is injectable so the tests can be deterministic without stubbing a
 * global.
 */
export function weightedShuffle<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  random: () => number = Math.random,
): T[] {
  return items
    .map(item => {
      // A weight at or below zero would make the exponent infinite and the key
      // zero, which is exclusion by arithmetic rather than by decision. The
      // floor keeps every item in the draw.
      const weight = Math.max(0.01, weightOf(item));
      return { item, key: Math.pow(random(), 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map(scored => scored.item);
}

/**
 * How much of a chance a track gets, from what is known about it.
 *
 * 1 for a track nothing is known about, so unknown and never-skipped are
 * treated alike — which is the honest reading, and also what keeps a fresh
 * install's shuffle uniform. Down to 0.2 for one abandoned every time.
 */
export function shuffleWeight(totals: EntityTotals | undefined): number {
  return totals ? listenQuality(totals) : 1;
}
