/**
 * What happened when someone played something.
 *
 * The app used to answer that with a counter: `songPlays[key] += 1`, once a
 * listen passed the scrobble threshold. Everything else about the listen was
 * discarded at the moment it was known — and it was all known, because
 * `playbackCoordinator` hands the outgoing track's position to
 * `scrobbleOutgoing` on *every* track change, skips included.
 *
 * What a counter cannot tell you, and this can:
 *
 * - **When.** Hour of day and day of week, which is most of what "context"
 *   means for one person's listening.
 * - **How much.** A track left at 0:20 of 4:00 is not a play, and it is not
 *   nothing either — it is the strongest negative signal the app ever
 *   receives, and it was the one thing the old system could not see at all,
 *   because a skip never reached the threshold that did the counting.
 * - **What sat around it.** The track before and the track after, in the same
 *   sitting. Collaborative filtering with n=1 — "you always end up here after
 *   there" — needs nothing but this, and it is the signal no metadata and no
 *   audio analysis can supply.
 *
 * Two consequences worth stating plainly, because they are the reason this is
 * a log and not a bigger counter. A count is a lossy summary of a log, so a
 * log can produce any count later; the reverse is never true. And a question
 * nobody has asked yet — "what do I skip in the mornings" — is answerable
 * retroactively from history that was recorded before anyone thought of it,
 * which is the whole argument for writing down the event rather than the
 * conclusion.
 *
 * This is deliberately **not** scrobbling. Scrobbling reports a listen
 * outward, to a server or to Last.fm, under their thresholds and their
 * schema — see `useScrobbling`. This records what happened, locally, for the
 * app's own use, under no threshold at all. They share a trigger and nothing
 * else, and conflating them is what made skips invisible.
 */

/**
 * How a track was left. The distinction the old counter could not draw.
 *
 * `finished` is the track running out. `skipped` is the listener leaving
 * early — by the next button, by picking something else, or by closing the
 * app. `interrupted` is everything that was not the listener's decision: a
 * lost stream, a failed track, a queue replaced underneath the playhead. Only
 * the first two say anything about taste, and lumping the third in with
 * `skipped` would teach the app that a bad connection is a dislike.
 */
export type ListenEnding = 'finished' | 'skipped' | 'interrupted';

export interface ListenEvent {
  /** Unix ms at which the listen *started*. */
  at: number;
  /** `serverId:songId`, matching the key scheme the stats slice already uses. */
  track: string;
  album?: string;
  artist?: string;
  /** The collection the queue position came from, when it was a playlist. */
  playlist?: string;
  /** Seconds actually listened. Not the position — a seek backwards adds. */
  seconds: number;
  /** The track's full length in seconds, or 0 when unknown (live radio). */
  duration: number;
  ending: ListenEnding;
  /**
   * Which sitting this belongs to. A monotonic ordinal rather than a
   * timestamp, so "same session" is an integer comparison at every call site
   * that walks the log looking for adjacency.
   */
  session: number;
}

/**
 * How long a gap makes it a new sitting.
 *
 * Thirty minutes. Short enough that the morning and the evening are not one
 * session — which would make their co-occurrence edges meaningless — and long
 * enough to survive a commute, a phone call, or a walk between buildings. It
 * is the same figure Last.fm and ListenBrainz use for the same purpose, and
 * there is no reason to be original about it.
 */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/**
 * The fraction of the track that was heard, clamped to 0..1.
 *
 * Zero for a track with no duration — live radio has no proportion to be
 * through. Clamped above because a seek backwards can accumulate more
 * listened seconds than the track is long, and a completion of 1.4 would
 * quietly poison every average it entered.
 */
export function completionOf(event: Pick<ListenEvent, 'seconds' | 'duration'>): number {
  if (event.duration <= 0) return 0;
  return Math.max(0, Math.min(1, event.seconds / event.duration));
}

/**
 * Whether this listen is evidence of *dislike* rather than of circumstance.
 *
 * Deliberately strict on both sides. It has to be the listener's own decision
 * — an interrupted track says nothing — and it has to be early: past the
 * halfway mark a skip is somebody moving on from a track they have heard,
 * which is not the same as rejecting it. The eight-second floor is there
 * because the first seconds of a queue are frequently skipped through while
 * someone is looking for something, and counting those would mark the whole
 * front of every album as disliked.
 */
export function isRejection(event: ListenEvent): boolean {
  if (event.ending !== 'skipped') return false;
  if (event.seconds < 8) return false;
  return completionOf(event) < 0.5;
}

/**
 * Whether this counts as having *played* the track, for a count anybody reads.
 *
 * Matches the scrobble threshold — half the track or four minutes, whichever
 * comes first — so a number shown in the app and a number shown on Last.fm
 * for the same listen agree. They would otherwise differ by exactly the
 * listens this log records and scrobbling declines to, which is a support
 * question nobody should have to answer.
 */
export function countsAsPlay(event: ListenEvent): boolean {
  const threshold = event.duration > 0
    ? Math.min(Math.floor(event.duration * 0.5), 4 * 60)
    : 4 * 60;
  return event.seconds >= threshold;
}

/**
 * Which session a listen at `at` belongs to, given the last one recorded.
 *
 * Pure, and takes the previous event rather than reading a clock, so the
 * sessionisation of a log is a function of the log — replayable, testable,
 * and the same on a device whose clock moved.
 */
export function sessionFor(at: number, previous: ListenEvent | undefined): number {
  if (!previous) return 1;
  const gap = at - previous.at;
  // A clock that went backwards is not a gap. Treat it as the same sitting
  // rather than minting a session per tick while the time settles.
  if (gap < 0) return previous.session;
  return gap > SESSION_GAP_MS ? previous.session + 1 : previous.session;
}

/**
 * How much of the end may be missing and still count as having finished.
 *
 * Five seconds. The position the player reports on the way out is the last
 * one it rendered, not the track's length, and gapless trimming, encoder
 * padding and the crossfade all take a slice off that — so an exact
 * comparison would file almost every track that played through as a skip, and
 * the skip signal is the one thing here that must not cry wolf.
 */
export const FINISHED_SLACK_SECONDS = 5;

/**
 * Whether the track ran out or the listener left.
 *
 * Derived from where the playhead was, because that is what the player can
 * actually report at a track change. `interrupted` is deliberately not
 * inferable here — a lost stream and a deliberate skip look identical from a
 * position alone — so it has to be passed in by whoever knows, and until a
 * path does, nothing is wrongly blamed on the listener: an unclassifiable
 * early exit reads as `skipped`, which `isRejection` then filters by its own
 * rules.
 */
export function endingFrom(leftAtSeconds: number, duration: number): ListenEnding {
  if (duration <= 0) return 'skipped';
  return leftAtSeconds >= duration - FINISHED_SLACK_SECONDS ? 'finished' : 'skipped';
}

/** The hour of day a listen started, 0..23, in the device's own zone. */
export function hourOf(event: ListenEvent): number {
  return new Date(event.at).getHours();
}

/** 0 = Sunday, matching `Date.getDay`. */
export function weekdayOf(event: ListenEvent): number {
  return new Date(event.at).getDay();
}
