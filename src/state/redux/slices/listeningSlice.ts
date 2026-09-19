import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import {
  countsAsPlay,
  isRejection,
  sessionFor,
  type ListenEvent,
} from '@/features/listening/listeningEvent';

/**
 * How many events are kept in full.
 *
 * Events are the expensive half of this slice and the only half with a bound
 * on it, so the number is a straight trade: sequence-dependent questions —
 * co-occurrence, "what follows what", session shapes — can only see this far
 * back, and everything else is answered from `totals`, which is not evicted.
 *
 * Four thousand is roughly four thousand tracks, so a few months for somebody
 * who listens daily and considerably longer for anybody else. At about 130
 * bytes of JSON each that is well under a megabyte, which matters because
 * this slice is persisted whole on a one-second throttle like every other —
 * see the note above `statsPersistConfig`.
 *
 * Raising it is safe and cheap. Lowering it silently shortens the memory of
 * every sequence-based feature, which is not visible anywhere, so do not
 * lower it without saying why here.
 */
export const MAX_EVENTS = 4000;

/**
 * What survives eviction.
 *
 * The lifetime numbers a user sees — how many times, how long, when first and
 * last — have to outlive the event that produced them, or a play count would
 * quietly fall as the ring wrapped. So every event updates a per-track
 * rollup on the way in, and the rollup is never trimmed.
 *
 * Unlike the server-stat maps beside it, this only ever holds tracks somebody
 * actually touched. `serverSongPlays` carries an entry per track in the
 * library — fifty thousand of them zero, on Jellyfin, which reports
 * `PlayCount: 0` for everything — and pays for all of them on every scan.
 * A track nobody has played has no row here at all, which is both smaller and
 * the honest representation: *unknown* and *zero* are different facts, and
 * "never played" is exactly the set the rediscovery surfaces want.
 */
export interface TrackTotals {
  /** Listens that passed the play threshold — the number a user is shown. */
  plays: number;
  /** Every time the track started, threshold or not. */
  starts: number;
  /** Early skips the listener chose. The negative signal. */
  rejections: number;
  /** Total seconds listened, across every start. */
  seconds: number;
  firstAt: number;
  lastAt: number;
}

interface ListeningState {
  /** Oldest first. Append at the end, evict from the front. */
  events: ListenEvent[];
  totals: Record<string, TrackTotals>;
}

const initialState: ListeningState = { events: [], totals: {} };

/** Everything about a listen except which sitting it belongs to, which is the
 *  reducer's to decide — it is the only place that can see the one before. */
export type RecordedListen = Omit<ListenEvent, 'session'>;

const emptyTotals = (at: number): TrackTotals => ({
  plays: 0,
  starts: 0,
  rejections: 0,
  seconds: 0,
  firstAt: at,
  lastAt: at,
});

const listeningSlice = createSlice({
  name: 'listening',
  initialState,
  reducers: {
    /**
     * Write down a listen that has just ended.
     *
     * Called for **every** departure from a track, including one skipped after
     * two seconds. Filtering is the reader's job — `countsAsPlay` and
     * `isRejection` are right here — because a threshold applied on the way in
     * cannot be undone, and the skips are the part the old counter was missing.
     */
    recordListen(state, action: PayloadAction<RecordedListen>) {
      const listen = action.payload;
      // A listen of no length is a track that was loaded and left, or a
      // double-report of the same departure. Neither is evidence of anything
      // and both would distort the skip rate, which is the one derived figure
      // that divides by `starts`.
      if (listen.seconds <= 0) return;

      const previous = state.events[state.events.length - 1];
      const event: ListenEvent = {
        ...listen,
        session: sessionFor(listen.at, previous),
      };

      state.events.push(event);
      if (state.events.length > MAX_EVENTS) {
        state.events.splice(0, state.events.length - MAX_EVENTS);
      }

      const totals = state.totals[event.track] ?? emptyTotals(event.at);
      totals.starts += 1;
      totals.seconds += event.seconds;
      if (countsAsPlay(event)) totals.plays += 1;
      if (isRejection(event)) totals.rejections += 1;
      totals.firstAt = Math.min(totals.firstAt, event.at);
      totals.lastAt = Math.max(totals.lastAt, event.at);
      state.totals[event.track] = totals;
    },

    /**
     * Seed totals from the counters this replaced, once.
     *
     * Without it, everyone's play counts reset to zero on the update that
     * shipped this — the app would have thrown away the only record it had of
     * years of listening, in the change whose entire purpose is to take that
     * record seriously.
     *
     * Seeded rows carry `starts` equal to `plays` and no rejections, because
     * that is all the old data says. They are deliberately *not* marked as
     * estimates: every derivation here treats a missing signal as absent
     * rather than as zero, so a seeded row simply contributes nothing to skip
     * rate until it is played again, at which point real events take over.
     */
    seedFromLegacyCounts(
      state,
      action: PayloadAction<{ plays: Record<string, number>; lastPlayedAt: Record<string, number> }>,
    ) {
      const { plays, lastPlayedAt } = action.payload;
      for (const [track, count] of Object.entries(plays)) {
        if (count <= 0) continue;
        if (state.totals[track]) continue; // real events already know better
        const at = lastPlayedAt[track] ?? 0;
        state.totals[track] = {
          plays: count,
          starts: count,
          rejections: 0,
          seconds: 0,
          firstAt: at,
          lastAt: at,
        };
      }
    },

    /**
     * Forget everything. A privacy control, not a maintenance one.
     *
     * Someone who self-hosts to stop being measured is owed a way to delete
     * what this app measured, and it has to take the derived rollups with it —
     * clearing the events and leaving the totals would look like deletion and
     * not be it.
     */
    clearListeningHistory(state) {
      state.events = [];
      state.totals = {};
    },
  },
});

export const { recordListen, seedFromLegacyCounts, clearListeningHistory } =
  listeningSlice.actions;
export default listeningSlice.reducer;
