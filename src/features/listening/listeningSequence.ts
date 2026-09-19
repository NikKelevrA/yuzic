import { isRejection, type ListenEvent } from './listeningEvent';

/**
 * What the listener plays after what.
 *
 * This is collaborative filtering with n = 1, and it is the most
 * under-exploited signal a self-hosted player has. The usual form —
 * "people who played A also played B" — needs a population. Run the same
 * computation across one person's own sittings and it becomes *"you always
 * end up at B after A"*, which needs no population, no metadata, no audio
 * analysis, no network, and nobody else's listening at all.
 *
 * It also encodes things no tag can. That two records share nothing in genre,
 * year, label or personnel and are nonetheless always played together is a
 * fact about this listener that exists in no database anywhere, and it is
 * exactly the adjacency a good queue is made of.
 *
 * The whole structure is a sparse map over a few thousand tracks, built by one
 * pass over the event log. It costs nothing and it is computed on a device
 * that is already holding the log.
 */

/** A followed-by count, keyed by the successor's track key. */
type Successors = Map<string, number>;

/** The graph: for each track, what tends to come next. */
export type SequenceGraph = Map<string, Successors>;

/**
 * How many tracks ahead still counts as "after".
 *
 * Two. The track immediately following carries most of the signal; the one
 * after that catches the case where something short or skipped sat between
 * them. Beyond that the association is really "same sitting", which is a much
 * weaker claim and would blur every edge toward whatever the listener plays
 * most.
 */
const SEQUENCE_WINDOW = 2;

/**
 * Build the graph from a log.
 *
 * Two rules do most of the work, and both are about not learning the wrong
 * thing:
 *
 * - **Pairs never cross a session.** The last track of the morning did not
 *   lead to the first track of the evening; twelve hours sat between them.
 *   Without this every edge would be polluted by whatever happens to start
 *   sittings, which for most people is the same handful of records.
 * - **A rejected track is not a source.** If something was skipped at fifteen
 *   seconds, what came next is what the listener went to *instead* — that is
 *   an escape, not a sequence, and treating it as one teaches the app to
 *   follow every disliked track with the thing used to get away from it. It
 *   is still a valid *destination*, because arriving somewhere after
 *   abandoning something is a real transition.
 */
export function buildSequenceGraph(events: readonly ListenEvent[]): SequenceGraph {
  const graph: SequenceGraph = new Map();

  for (let i = 0; i < events.length; i += 1) {
    const from = events[i];
    if (isRejection(from)) continue;

    for (let ahead = 1; ahead <= SEQUENCE_WINDOW; ahead += 1) {
      const to = events[i + ahead];
      if (!to) break;
      if (to.session !== from.session) break;
      if (to.track === from.track) continue;

      const successors = graph.get(from.track) ?? new Map<string, number>();
      // Adjacent pairs count fully; the one beyond counts half, so a genuine
      // neighbour always outranks a track that merely appeared nearby.
      successors.set(to.track, (successors.get(to.track) ?? 0) + 1 / ahead);
      graph.set(from.track, successors);
    }
  }

  return graph;
}

/**
 * How strongly `to` tends to follow `from`, or 0 if it does not.
 *
 * The single reading the ranker needs. `minimumWeight` is the guard against
 * reading meaning into one evening: a single occurrence is a coincidence, and
 * treating it as a habit would let one accidental pairing steer a queue. Two
 * is the lowest number that can honestly be called a pattern.
 */
export function sequenceWeight(
  graph: SequenceGraph,
  from: string,
  to: string,
  minimumWeight = 2,
): number {
  const weight = graph.get(from)?.get(to) ?? 0;
  return weight >= minimumWeight ? weight : 0;
}
