/**
 * How much of a track was actually heard, as opposed to how far into it the
 * playhead got.
 *
 * `ListenEvent.seconds` has always been documented as "seconds actually
 * listened — not the position, a seek backwards adds", and nothing in the app
 * ever produced that number. Every producer handed over a playhead:
 * `transportController` its `position()`, `playbackCoordinator` the outgoing
 * track's `getOutgoingProgress().position`, the heartbeat its last tick. The
 * comment described an intent; the code delivered a different quantity under
 * the same name, and four readers were written against whichever reading the
 * author had in mind at the time.
 *
 * That mattered in both directions at once:
 *
 * - `endingFrom` and the resume bookmark *need* the playhead. "Did the track
 *   run out" is a question about where the playhead was, and a resume point
 *   that is not a position is not a resume point. Feeding those listened time
 *   would file a track someone rewound and re-heard as `finished` at 0:30.
 * - The scrobble threshold ("half the track, or four minutes") and
 *   `completionOf`/`countsAsPlay` *need* listened time. Feeding those the
 *   playhead under-counts exactly the listener who rewound: three and a half
 *   minutes of a four-minute track, left at 1:00, is a playhead of 60s against
 *   a 120s threshold, and no scrobble for a track they heard nearly twice.
 *
 * So the field was never one quantity. This module supplies the second one,
 * and the playhead keeps being passed where a playhead is what is wanted.
 *
 * **It is a refinement, never a dependency.** Every reader falls back to the
 * playhead when this has nothing latched for a track, so a path that does not
 * yet feed the meter behaves exactly as it did before this existed rather than
 * scrobbling zero.
 *
 * A module-level singleton for the same reason `activeBackend` is one: it is
 * written from a transport controller, a coordinator and an effect, and read
 * from a hook with none of them above it in the tree. There is exactly one
 * playhead, so there is exactly one meter.
 */

/**
 * The largest jump between two observations that is treated as playback
 * rather than as a seek.
 *
 * Observations arrive from the 10s heartbeat, so 12 leaves slack for a late
 * timer without ever crediting a forward seek as listening. A jump larger
 * than this — or any jump backwards — re-anchors and credits nothing, which
 * is the conservative direction: an unobserved seek costs the listener at
 * most one heartbeat of credit, where the opposite mistake would hand them a
 * scrobble for a track they scrubbed through.
 */
const MAX_OBSERVED_STEP_SECONDS = 12;

/** How many finished listens stay latched, waiting to be read. */
const LATCH_LIMIT = 8;

type MeterState = {
  /** Seconds credited from closed stretches of play. */
  accumulated: number;
  /** Where the current stretch began, or null before the first observation. */
  anchor: number | null;
};

/** Credit the stretch between `anchor` and `position`, if it looks like play. */
function observed(state: MeterState, position: number): MeterState {
  const at = Math.max(0, position);
  if (state.anchor === null) return { accumulated: state.accumulated, anchor: at };
  const step = at - state.anchor;
  if (step < 0 || step > MAX_OBSERVED_STEP_SECONDS) {
    // A seek. The stretch that was running is closed without credit for the
    // jump itself; anything already accumulated stays.
    return { accumulated: state.accumulated, anchor: at };
  }
  return { accumulated: state.accumulated + step, anchor: at };
}

/** What `observed` would credit, without moving the anchor. */
function totalAt(state: MeterState, position: number): number {
  return observed(state, position).accumulated;
}

const EMPTY: MeterState = { accumulated: 0, anchor: null };

let live: MeterState = EMPTY;
/**
 * Finished listens waiting to be read, newest last, keyed by the song's own
 * id on the server.
 *
 * Keyed by track rather than by the listen's start time because the reader —
 * `useScrobbling` — is handed the song and the start time separately, and the
 * producers that latch here (a transport skip, a track change) can name the
 * song without reaching for the session's clock. Two departures from the same
 * track inside one deferred send is the only case last-wins loses, and that is
 * a track skipped twice in under a second.
 */
const latched = new Map<string, number>();

/** Position samples, from anywhere that has one. Safe to call while paused. */
export function observePosition(positionSeconds: number): void {
  live = observed(live, positionSeconds);
}

/**
 * A seek, told to the meter by whoever performed it.
 *
 * Two steps rather than one: the stretch up to `fromSeconds` is real listening
 * and is credited, and the new stretch starts at the destination. Without this
 * the next heartbeat would see the jump and, correctly but bluntly, throw away
 * up to ten seconds of play that had happened before the seek.
 *
 * A seek the app never performed — the lock screen's scrubber, a car head
 * unit — is not routed through here, and costs that same heartbeat. It is not
 * worth a faster timer to recover.
 */
export function observeSeek(fromSeconds: number, toSeconds: number): void {
  live = observed(live, fromSeconds);
  live = { accumulated: live.accumulated, anchor: Math.max(0, toSeconds) };
}

/** Listened seconds for the listen still in progress, ending at `positionSeconds`. */
export function listenedSoFar(positionSeconds: number): number {
  return Math.floor(totalAt(live, positionSeconds));
}

/**
 * Close the current listen and leave its total where the scrobbler can find it.
 *
 * Called by whoever knows the track is being left, *before* anything resets
 * the listen — the outgoing scrobble is deferred by a second (see
 * `OUTGOING_SCROBBLE_DELAY_MS`), and by the time it runs the session has
 * already started the next listen's clock. Latching at the departure rather
 * than reading live is what keeps the number attached to the right song.
 */
export function finishListen(songId: string, leftAtSeconds: number): number {
  const total = Math.floor(totalAt(live, leftAtSeconds));
  latchListen(songId, total);
  live = EMPTY;
  return total;
}

/**
 * Latch a total this meter did not measure.
 *
 * For a listen that outlived the process that was measuring it: the
 * checkpoint on disk knows how much was heard, and the replay on the next
 * launch goes through the same reader as every other departure, so the number
 * has to arrive the same way.
 */
export function latchListen(songId: string, listenedSeconds: number): void {
  latched.delete(songId);
  latched.set(songId, Math.max(0, Math.floor(listenedSeconds)));
  while (latched.size > LATCH_LIMIT) {
    const oldest = latched.keys().next();
    if (oldest.done) break;
    latched.delete(oldest.value);
  }
}

/**
 * The latched total for a departure, consumed.
 *
 * Null when nothing latched it, which is the signal to fall back to the
 * playhead rather than to zero. Consumed on read so a second report of the
 * same departure — which `useScrobbling` already guards against, defensively —
 * cannot be credited twice from here either.
 */
export function takeFinishedListen(songId: string): number | null {
  const total = latched.get(songId);
  if (total === undefined) return null;
  latched.delete(songId);
  return total;
}

/** A new listen begins; nothing of the last one carries into it. */
export function resetListen(): void {
  live = EMPTY;
}
