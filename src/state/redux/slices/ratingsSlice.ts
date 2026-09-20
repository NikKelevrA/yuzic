import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { removeServer } from '@/state/redux/slices/serversSlice';

import { clampRating } from '@/domain/entities/Rating';

/**
 * Ratings the user has given since the catalog was last fetched.
 *
 * Not a second copy of the server's ratings — an *overlay* on top of them,
 * and only for the ones the app itself wrote. A rating lives on the server;
 * it reaches the app on the entity, as `userRating`, and every screen reads
 * it there. The problem this solves is the gap in between: the moment the
 * user taps a third star, that entity is already in a dozen caches — the
 * album screen's track list, the persisted catalog, a home shelf, the queue —
 * and rewriting all of them is not a thing a rating should have to do.
 *
 * So the write goes to the server and one number goes here, and
 * `features/ratings` reads the two together. The overlay wins while it
 * exists, and it exists until the next sync, which is the point at which the
 * catalog has been told the truth and can be trusted with it again.
 *
 * Keyed by server id: the same track id on two servers is two tracks, and a
 * rating is per-user-per-server.
 */
interface RatingsState {
  /** serverId -> the entity's own id on that server -> stars. */
  byServer: Record<string, Record<string, number>>;
}

const initialState: RatingsState = { byServer: {} };

const ratingsSlice = createSlice({
  name: 'ratings',
  initialState,
  reducers: {
    /**
     * Records what the user just gave something.
     *
     * Zero is a value like any other here rather than a removal: "the user
     * cleared this rating" is exactly what has to survive until the next
     * sync, and deleting the key would let the catalog's stale non-zero
     * reading win straight back.
     */
    setRatingOverride(
      state,
      action: PayloadAction<{ serverId: string; nativeId: string; rating: number }>
    ) {
      const { serverId, nativeId, rating } = action.payload;
      if (!serverId || !nativeId) return;
      const forServer = state.byServer[serverId] ?? (state.byServer[serverId] = {});
      forServer[nativeId] = clampRating(rating);
    },

    /**
     * Drops one entry, for a write the server refused.
     *
     * The optimistic value is set before the request and removed again if it
     * fails, so the stars go back to what the catalog says rather than
     * showing a rating the server never took.
     */
    clearRatingOverride(
      state,
      action: PayloadAction<{ serverId: string; nativeId: string }>
    ) {
      const forServer = state.byServer[action.payload.serverId];
      if (forServer) delete forServer[action.payload.nativeId];
    },

    /**
     * Forgets a server's overlay, because the catalog has just been refetched
     * and now carries these ratings itself.
     *
     * A server switch needs no such call: the overlay is keyed by server id,
     * so the one belonging to the server you left is simply never read while
     * you are on another.
     */
    clearServerRatings(state, action: PayloadAction<string>) {
      delete state.byServer[action.payload];
    },
  },
  /**
   * Forget a server the listener removed.
   *
   * Wired to the action rather than dispatched beside it, because the one
   * caller that removes a server should not have to remember every slice that
   * kept something for it — and the next caller would not.
   */
  extraReducers: builder => {
    builder.addCase(removeServer, (state, action) => {
      delete state.byServer[action.payload];
    });
  },
});

export const { setRatingOverride, clearRatingOverride, clearServerRatings } =
  ratingsSlice.actions;

/** The overlay for one server, or an empty map where there is none. */
export const selectRatingOverrides =
  (serverId: string | undefined) =>
  (state: { ratings: RatingsState }): Record<string, number> =>
    (serverId && state.ratings.byServer[serverId]) || EMPTY;

/** One shared empty map, so a server with no overrides returns a stable
 *  reference and `useSelector` does not re-render on every dispatch. */
const EMPTY: Record<string, number> = {};

export default ratingsSlice.reducer;
