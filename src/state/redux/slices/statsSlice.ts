import { createSlice, original, PayloadAction } from "@reduxjs/toolkit";
import { removeServer } from "@/state/redux/slices/serversSlice";
import { withoutServerNamespace } from "@/state/redux/serverScopedState";

type PlayMap = Record<string, number>;
type LastPlayedMap = Record<string, number>; // "serverId:entityId" -> timestamp (ms)

const key = (serverId: string, id: string) => `${serverId}:${id}`;

/**
 * One server's entries dropped, as a new map, so the caller can write the set
 * the server just reported.
 *
 * Server stat maps used to only ever be merged into, so an album whose count
 * went back to zero — or that left the library entirely — kept its old number
 * for good, and the map grew without bound across library churn.
 *
 * Built fresh rather than edited in place: these maps have a row per track,
 * and deleting ninety thousand properties one at a time is what aborted Hermes
 * on the second sync of a large library. See `withoutServerNamespace`.
 */
const replaceNamespace = (
  map: Readonly<Record<string, number>>,
  serverId: string
): Record<string, number> => withoutServerNamespace(map, serverId);

type ServerAlbumStat = {
  id: string;
  playCount: number;
  lastPlayedAt: number; // unix ms, 0 if never played
};

type ServerSongStat = {
  id: string;
  playCount: number;
  lastPlayedAt?: number;
};

/**
 * What the *server* says about plays, and nothing else.
 *
 * This slice used to carry a second, local tally as well — counted here the
 * moment a listen passed the scrobble threshold, then dropped per entity as
 * the server's own number arrived. That half is gone. It was a parallel record
 * of something `listeningSlice` already writes from the same call site, and a
 * worse one: it could not see a skip, because the only thing that triggered it
 * was a scrobble, which a skip by definition never earns.
 *
 * `statsSelectors` merges the two sources now, and the merge is `Math.max`
 * rather than a sum — see the note there for why a log cannot be an optimistic
 * overlay the way a counter could.
 *
 * Artists and playlists have no server number at all, so they have no entry
 * here either; the log is the whole truth for them.
 */
interface StatsState {
  /*
   Written by versions before the listening log, read exactly once by
   `useLegacyStatsMigration`, and never written here again.

   They are declared rather than cast away because they genuinely are part of
   the persisted shape on every existing install: redux-persist rehydrates what
   it stored, so dropping them from the type would not remove them from the
   device — it would only mean the one piece of code that has to read them has
   to lie about the state to do it.

   Optional, because a fresh install has never had them. Nothing but the
   migration may read these, and nothing at all may write them.
  */
  songPlays?: PlayMap;
  albumPlays?: PlayMap;
  artistPlays?: PlayMap;
  playlistPlays?: PlayMap;
  songLastPlayedAt?: LastPlayedMap;
  albumLastPlayedAt?: LastPlayedMap;
  artistLastPlayedAt?: LastPlayedMap;
  playlistLastPlayedAt?: LastPlayedMap;

  /** Play counts sourced from the server during sync. Key: "serverId:albumId" */
  serverAlbumPlays: PlayMap;
  /** Last played timestamps sourced from the server during sync. Key: "serverId:albumId" */
  serverAlbumLastPlayedAt: LastPlayedMap;
  /** Play counts sourced from the server during sync. Key: "serverId:songId" */
  serverSongPlays: PlayMap;
  /** Last played timestamps sourced from the server during sync. Key: "serverId:songId" */
  serverSongLastPlayedAt: LastPlayedMap;
}

const initialState: StatsState = {
  serverAlbumPlays: {},
  serverAlbumLastPlayedAt: {},
  serverSongPlays: {},
  serverSongLastPlayedAt: {},
};

const statsSlice = createSlice({
  name: "stats",
  initialState,
  reducers: {
    setServerAlbumStats(
      state,
      action: PayloadAction<{ serverId: string; stats: ServerAlbumStat[] }>
    ) {
      const { serverId, stats } = action.payload;
      // Read through to the untouched state and build plain maps: every write
      // below would otherwise go through a draft proxy, one per track.
      const base = original(state) ?? state;
      const plays = replaceNamespace(base.serverAlbumPlays, serverId);
      const lastPlayed = replaceNamespace(base.serverAlbumLastPlayedAt, serverId);
      for (const { id, playCount, lastPlayedAt } of stats) {
        const k = key(serverId, id);
        plays[k] = playCount;
        if (lastPlayedAt > 0) lastPlayed[k] = lastPlayedAt;
      }
      state.serverAlbumPlays = plays;
      state.serverAlbumLastPlayedAt = lastPlayed;
    },

    setServerSongStats(
      state,
      action: PayloadAction<{ serverId: string; stats: ServerSongStat[] }>
    ) {
      const { serverId, stats } = action.payload;
      const base = original(state) ?? state;
      const plays = replaceNamespace(base.serverSongPlays, serverId);
      const lastPlayed = replaceNamespace(base.serverSongLastPlayedAt, serverId);
      for (const { id, playCount, lastPlayedAt } of stats) {
        const k = key(serverId, id);
        plays[k] = playCount;
        if (lastPlayedAt && lastPlayedAt > 0) {
          lastPlayed[k] = lastPlayedAt;
        }
      }
      state.serverSongPlays = plays;
      state.serverSongLastPlayedAt = lastPlayed;
    },
  },
  /**
   * Forget a server the listener removed.
   *
   * Wired to the action rather than dispatched beside it, because the one
   * caller that removes a server should not have to remember nine slices —
   * and the next caller would not.
   */
  extraReducers: builder => {
    builder.addCase(removeServer, (state, action) => {
      const serverId = action.payload;
      for (const map of [
        state.serverAlbumPlays,
        state.serverAlbumLastPlayedAt,
        state.serverSongPlays,
        state.serverSongLastPlayedAt,
      ]) {
        replaceNamespace(map, serverId);
      }
    });
  },
});

export const { setServerAlbumStats, setServerSongStats } = statsSlice.actions;
export default statsSlice.reducer;
