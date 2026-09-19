import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import type { ListenEvent } from './listeningEvent';
import {
  affinity,
  dormancy,
  dormancyReason,
  listenQuality,
  rankBy,
  type DormancyReason,
} from './listeningAffinity';
import { buildSequenceGraph, type SequenceGraph } from './listeningSequence';
import { rankForListener } from './listeningRanking';
import { shuffleWeight, weightedShuffle } from './listeningShuffle';

/**
 * One model of the listener, that every feature asks.
 *
 * The pieces underneath — affinity, dormancy, the sequence graph, the shuffle
 * weighting — were each built for the caller that needed them, and each caller
 * wired itself to a different one. Autoplay reached for the ranker, Smart
 * Shuffle for the weighting, the stats screen for the summaries, and a sixth
 * feature would have meant a sixth wiring and a sixth opinion about what a
 * skip is worth.
 *
 * This is the single surface. The policies stay where they are and stay pure —
 * that is what makes them testable — and this composes them, so there is one
 * place that answers *what does this listener prefer* and one place where two
 * features can be seen to disagree.
 *
 * The important consequence is `order`. A caller does not choose a formula; it
 * states a **purpose**, and the policy for that purpose lives here next to the
 * others. Adding a shelf means adding a purpose, not inventing a ranking, and
 * the fact that "continue" tilts away from what gets skipped while "rediscover"
 * deliberately digs up what has been dropped is legible in one file rather
 * than spread across six.
 *
 * Built from the state once and treated as immutable. Nothing here reads a
 * store, a clock or a network: `now` is passed in, so every ordering is
 * reproducible and testable with literals.
 */

/**
 * What a caller wants an ordering *for*.
 *
 * - `continue` — the queue is running on past what the listener chose.
 *   Habits pull forward, skips push back, and volume is deliberately ignored:
 *   ranking by what is already played most is the narrowing that turns a large
 *   library into a small one.
 * - `shuffle` — a genuine shuffle, with the odds tilted away from what gets
 *   abandoned. Every item present, a different order each time.
 * - `favourite` — what the listener is into now. Recency-weighted, so a record
 *   loved two years ago does not outrank one loved this month.
 * - `rediscover` — what they loved and stopped. The inverse of `favourite`,
 *   and the one thing here a streaming service cannot compute, because it
 *   needs a long tail the listener owns.
 */
type OrderingPurpose = 'continue' | 'shuffle' | 'favourite' | 'rediscover';

/**
 * Which rollup a key belongs to.
 *
 * A listen is evidence about four things at once, and each is rolled up
 * separately — so a caller ordering albums has to say so, or its keys are
 * looked up among tracks and every one of them misses. Explicit rather than
 * inferred from the key, because a key carries no kind and guessing wrong is
 * silent: the model would simply report knowing nothing and leave the list
 * alone, which looks exactly like working code.
 */
type ListeningScope = 'track' | 'album' | 'artist' | 'playlist';

interface OrderingContext {
  /** For `continue`: the track the queue is carrying on from. */
  after?: string | null;
  /** For `favourite` and `rediscover`: how many to return. */
  limit?: number;
  /** Defaults to `track`. */
  scope?: ListeningScope;
}

export interface ListenerModel {
  /** How much the listener is into something, now. Zero for the unknown. */
  affinityOf(key: string, scope?: ListeningScope): number;
  /** Evidence they loved it and stopped. Zero for anything never played. */
  dormancyOf(key: string, scope?: ListeningScope): number;
  /** Share of starts they abandoned early, 0..1. */
  rejectionOf(key: string, scope?: ListeningScope): number;
  /**
   * The facts behind a rediscovery suggestion, for a surface that explains
   * itself. "You played this 47 times, and not for two years" is checkable by
   * the person reading it, which is worth more than any amount of "because you
   * like indie".
   */
  reasonFor(key: string, scope?: ListeningScope): DormancyReason;
  /** Whether there is enough history for any of this to mean anything. */
  readonly informed: boolean;
  /** The one ordering entry point. */
  order<T>(
    items: readonly T[],
    keyOf: (item: T) => string,
    purpose: OrderingPurpose,
    context?: OrderingContext,
  ): T[];
}

const NOTHING: EntityTotals = {
  plays: 0, starts: 0, rejections: 0, seconds: 0, firstAt: 0, lastAt: 0,
};

/**
 * Below this the model says nothing at all.
 *
 * A handful of listens is not a taste, and acting on one would mean a fresh
 * install's second session already being steered by its first. Callers ask
 * `informed` when they want to hide a surface rather than show an empty one.
 */
export const ENOUGH_TO_KNOW = 20;

/**
 * Where the history is worth listening to in full.
 *
 * Between this and `ENOUGH_TO_KNOW` the model's influence *ramps* rather than
 * switching on, because a threshold alone is a cliff: at nineteen events
 * nothing is personalised and at twenty every queue reorders at once, which is
 * a visible jump with no reason behind it except where the constant landed.
 *
 * Two hundred is a few weeks of ordinary listening. Early on the ordering is
 * mostly the provider's, and the listener's own habits take over as there is
 * enough of them to be worth taking over with — which is also the honest
 * representation of how much the app actually knows.
 */
export const CONFIDENT_AT = 200;

/**
 * 0 below `ENOUGH_TO_KNOW`, then `MINIMUM_INFLUENCE` rising to 1 at
 * `CONFIDENT_AT`.
 *
 * The floor matters: a linear ramp starting at zero would make the threshold
 * meaningless, since the first event past it would still change nothing. A
 * tenth of the full effect is small enough not to be felt as a jump and large
 * enough that crossing the line does something.
 */
export const MINIMUM_INFLUENCE = 0.1;

export function confidenceFrom(eventCount: number): number {
  if (eventCount < ENOUGH_TO_KNOW) return 0;
  const span = CONFIDENT_AT - ENOUGH_TO_KNOW;
  const ramped = (eventCount - ENOUGH_TO_KNOW) / span;
  return Math.min(1, Math.max(MINIMUM_INFLUENCE, ramped));
}

type Rollups = Record<ListeningScope, Record<string, EntityTotals>>;

interface ListenerModelInput {
  events: readonly ListenEvent[];
  rollups: Rollups;
  now: number;
}

export function buildListenerModel({ events, rollups, now }: ListenerModelInput): ListenerModel {
  const graph: SequenceGraph = buildSequenceGraph(events);
  const confidence = confidenceFrom(events.length);
  const informed = confidence > 0;
  const totalsFor = (key: string, scope: ListeningScope = 'track') =>
    rollups[scope][key] ?? NOTHING;

  const ranked = <T>(
    items: readonly T[],
    keyOf: (item: T) => string,
    scope: ListeningScope,
    score: (totals: EntityTotals) => number,
    limit: number,
  ) => rankBy(items, item => score(totalsFor(keyOf(item), scope)), limit);

  return {
    affinityOf: (key, scope) => affinity(totalsFor(key, scope), now),
    dormancyOf: (key, scope) => dormancy(totalsFor(key, scope), now),
    rejectionOf: (key, scope) => 1 - listenQuality(totalsFor(key, scope)),
    reasonFor: (key, scope) => dormancyReason(totalsFor(key, scope), now),
    informed,

    order(items, keyOf, purpose, context = {}) {
      // Nothing known is not a reason to invent an order. Every purpose falls
      // through to the caller's own, which for a shuffle still means shuffling
      // — uniformly, because that is what no information looks like.
      if (!informed) {
        return purpose === 'shuffle' ? weightedShuffle(items, () => 1) : [...items];
      }

      const scope = context.scope ?? 'track';

      switch (purpose) {
        case 'continue':
          return rankForListener(items, keyOf, {
            after: context.after ?? null,
            graph,
            totals: rollups.track,
            now,
            confidence,
          });

        case 'shuffle':
          // Blended toward uniform by the same confidence, so a new listener's
          // shuffle is a shuffle and an established one's is tilted.
          return weightedShuffle(items, item => {
            const weight = shuffleWeight(rollups.track[keyOf(item)]);
            return 1 + (weight - 1) * confidence;
          });

        case 'favourite':
          return ranked(items, keyOf, scope, e => affinity(e, now), context.limit ?? items.length);

        case 'rediscover':
          return ranked(items, keyOf, scope, e => dormancy(e, now), context.limit ?? items.length);
      }
    },
  };
}

/**
 * A model that knows nothing, for callers with no history to hand.
 *
 * Every ordering is the identity and every score is zero, so a surface built
 * on this behaves exactly as it did before any of it existed. Better than an
 * optional model threaded through call sites, which is how half of them end up
 * forgetting to check.
 */
export const UNINFORMED_MODEL: ListenerModel = buildListenerModel({
  events: [],
  rollups: { track: {}, album: {}, artist: {}, playlist: {} },
  now: 0,
});
