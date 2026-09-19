import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import { listenQuality } from './listeningAffinity';
import { sequenceWeight, type SequenceGraph } from './listeningSequence';

/**
 * Putting the listener's own habits in front of a queue somebody else chose.
 *
 * Autoplay asks a provider — the server's similar-songs endpoint, AudioMuse,
 * whatever is connected — for tracks like the one playing, then appends them
 * in whatever order they arrived. The provider knows the *music*: it can say
 * these ten records resemble that one. It knows nothing at all about the
 * person, so a track they have skipped eleven times out of twelve sits in the
 * queue exactly where a track they love would.
 *
 * This is the other half, and the division is the whole design:
 *
 * > **the provider decides the candidate set; the listener's own history
 * > decides the order.**
 *
 * Nothing here invents candidates or removes them on a hunch. Reordering is a
 * safe operation — every track still plays — where dropping would mean an
 * empty queue whenever the history is thin, which is exactly when the history
 * should have no say.
 *
 * Pure, and takes the graph and totals as arguments rather than reading a
 * store, so the whole policy is testable with a handful of literals.
 */

export interface RankingContext {
  /** The track the queue is continuing from, as a `serverId:trackId` key. */
  after: string | null;
  graph: SequenceGraph;
  totals: Record<string, EntityTotals>;
  now: number;
}

/**
 * How much a strong habit may move a track.
 *
 * A candidate the listener reliably plays after the current one can climb past
 * several the provider ranked above it, but not past the whole batch: the
 * provider's ordering is real information and a personal graph built from a
 * few hundred sittings should not erase it. Capped rather than unbounded so a
 * single very strong pairing cannot pin the same track to the top of every
 * queue for ever.
 */
const MAX_SEQUENCE_BOOST = 3;

/**
 * How far a track the listener keeps abandoning may fall.
 *
 * Down the batch, never out of it. A demoted track still plays if the queue
 * gets that far, which matters because a skip is weaker evidence than it
 * looks — people skip things they like in the wrong mood — and because a
 * listener who never hears a track again can never change their mind about it.
 */
const MAX_REJECTION_PENALTY = 4;

/**
 * Where a candidate should sit, as an adjustment to its original position.
 *
 * Negative moves it earlier. Returned as a delta rather than an absolute score
 * so the provider's ordering is the baseline and this is visibly a nudge — if
 * every term here is zero, which is the case on a fresh install, the batch
 * comes out exactly as the provider sent it.
 */
function positionDelta(key: string, context: RankingContext): number {
  const { after, graph, totals } = context;

  const habit = after ? sequenceWeight(graph, after, key) : 0;
  const boost = habit > 0 ? -Math.min(MAX_SEQUENCE_BOOST, habit) : 0;

  const entry = totals[key];
  if (!entry) return boost;

  // `listenQuality` is 1 for a track never abandoned and 0.2 for one always
  // abandoned, so this is 0 and 4 at the ends.
  const penalty = (1 - listenQuality(entry)) * (MAX_REJECTION_PENALTY / 0.8);

  /*
   There is deliberately no familiarity term.

   A first draft favoured tracks played recently and often, mildly. It was
   wrong twice over. Autoplay exists to continue *past* what the listener
   already chose, so ranking by what they already play is the algorithmic
   narrowing the research describes — Spotify's own findings have organic
   listening more diverse than programmed listening, and an app whose entire
   corpus is the user's own collection should not import the machinery that
   works against that. And it was mild enough to be a tiebreak rather than a
   signal, which meant it did nothing except entrench whatever the provider
   already ranked first.

   A habit is not familiarity: "you play B after A" is a fact about sequence,
   not about volume, and it is the one this file is for.
  */
  return boost + penalty;
}

/**
 * Reorder a batch of candidates by how well they fit this listener.
 *
 * Stable: equal adjustments keep the provider's order, so the arrangement is
 * deterministic and a candidate with nothing known about it never drifts.
 */
export function rankForListener<T>(
  candidates: readonly T[],
  keyOf: (candidate: T) => string,
  context: RankingContext,
): T[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      position: index + positionDelta(keyOf(candidate), context),
    }))
    .sort((a, b) => a.position - b.position || a.index - b.index)
    .map(scored => scored.candidate);
}
