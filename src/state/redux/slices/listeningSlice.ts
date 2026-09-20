import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import { removeServer } from '@/state/redux/slices/serversSlice';
import { forgetServerListening } from '@/features/listening/forgetServer';

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
export interface EntityTotals {
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

/**
 * Rolled up per entity, not only per track.
 *
 * A listen is evidence about four things at once — the track, its album, its
 * artist, and the playlist it was reached through — and every one of those has
 * a surface that ranks by it. Keeping only track rollups would mean album and
 * artist ranking had to walk the event ring, which is bounded, so an artist
 * played hundreds of times last year would silently rank below one played
 * twice last week purely because the older events had been evicted.
 *
 * The four maps are the same shape and updated in one pass, which is also what
 * lets `incrementPlay` go: it maintained a parallel, skip-blind copy of
 * exactly this, written from the same call site a moment later.
 */
interface ListeningState {
  /** Oldest first. Append at the end, evict from the front. */
  events: ListenEvent[];
  totals: Record<string, EntityTotals>;
  albums: Record<string, EntityTotals>;
  artists: Record<string, EntityTotals>;
  playlists: Record<string, EntityTotals>;
  /** Whether the counters this replaced have already been carried across. */
  legacySeeded: boolean;
}

const initialState: ListeningState = {
  events: [],
  totals: {},
  albums: {},
  artists: {},
  playlists: {},
  legacySeeded: false,
};

/** Everything about a listen except which sitting it belongs to, which is the
 *  reducer's to decide — it is the only place that can see the one before. */
export type RecordedListen = Omit<ListenEvent, 'session'>;

/** One of the four maps `incrementPlay` used to keep. */
export interface LegacyCounts {
  plays: Record<string, number>;
  lastPlayedAt: Record<string, number>;
}

const emptyTotals = (at: number): EntityTotals => ({
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

      const played = countsAsPlay(event);
      const rejected = isRejection(event);

      const roll = (into: Record<string, EntityTotals>, key: string | undefined) => {
        if (!key) return;
        const totals = into[key] ?? emptyTotals(event.at);
        totals.starts += 1;
        totals.seconds += event.seconds;
        if (played) totals.plays += 1;
        if (rejected) totals.rejections += 1;
        totals.firstAt = Math.min(totals.firstAt, event.at);
        totals.lastAt = Math.max(totals.lastAt, event.at);
        into[key] = totals;
      };

      roll(state.totals, event.track);
      roll(state.albums, event.album);
      roll(state.artists, event.artist);
      roll(state.playlists, event.playlist);
    },

    /**
     * Carry the counters this replaced across, once.
     *
     * Without it the update that shipped the log resets everybody's play
     * counts, in the change whose whole purpose is to take that record
     * seriously. Songs and albums would recover on the next sync because the
     * server has its own numbers — **artists and playlists would not.** No
     * Subsonic or Jellyfin server reports either, so those counters were the
     * only copy in existence, and losing them empties the ranking behind
     * Home's shelves and the figures on an artist's options sheet until the
     * listener rebuilds a history from nothing.
     *
     * Seeded rows carry `starts` equal to `plays` and no rejections, which is
     * all the old data says. Nothing here treats that as a clean record: every
     * derivation reads a missing signal as absent rather than as zero, so a
     * seeded row contributes nothing to skip rate until real events arrive.
     *
     * `legacySeeded` makes it once and for all. Running it twice would not
     * double anything — an existing row is left alone — but the flag is what
     * lets the caller stop reading a payload that will never change again.
     */
    seedFromLegacyCounts(
      state,
      action: PayloadAction<{
        tracks?: LegacyCounts;
        albums?: LegacyCounts;
        artists?: LegacyCounts;
        playlists?: LegacyCounts;
      }>,
    ) {
      const seed = (into: Record<string, EntityTotals>, counts: LegacyCounts | undefined) => {
        if (!counts) return;
        for (const [key, count] of Object.entries(counts.plays)) {
          if (count <= 0) continue;
          if (into[key]) continue; // real events already know better
          const at = counts.lastPlayedAt[key] ?? 0;
          into[key] = {
            plays: count,
            starts: count,
            rejections: 0,
            seconds: 0,
            firstAt: at,
            lastAt: at,
          };
        }
      };

      seed(state.totals, action.payload.tracks);
      seed(state.albums, action.payload.albums);
      seed(state.artists, action.payload.artists);
      seed(state.playlists, action.payload.playlists);
      state.legacySeeded = true;
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
      state.albums = {};
      state.artists = {};
      state.playlists = {};
      // The flag stays: the legacy counters are already gone from storage by
      // the time anyone can press this, and re-seeding them would restore
      // history the listener just asked to delete.
    },
  },
  extraReducers: builder => {
    builder.addCase(removeServer, (state, action) => {
      forgetServerListening(state, action.payload);
    });
  },
});

export const { recordListen, seedFromLegacyCounts, clearListeningHistory } =
  listeningSlice.actions;
export default listeningSlice.reducer;
