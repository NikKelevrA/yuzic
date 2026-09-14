import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * The scrobble targets a server can be routed to. Last.fm-direct is
 * deliberately not modelled here this cut — Last.fm's real API needs a
 * signed session (api_sig), which isn't built yet, so its route only ever
 * takes 'disabled' | 'through-server'. ListenBrainz supports all three,
 * because `api/listenbrainz` already scrobbles it directly with a token.
 */
export type ScrobbleDestinationKind = 'lastfm' | 'listenbrainz';
export type ScrobbleRoute = 'disabled' | 'through-server' | 'direct';

/**
 * One route per destination per server — never both 'through-server' and
 * 'direct' for the same destination, because there is only one field to hold
 * either value. That is what keeps "exactly one route per destination" true
 * by construction rather than by convention.
 *
 * Missing entries (a server that predates this feature) fall back to a
 * default derived from `serverScrobbleEnabled` / ListenBrainz-per-server
 * `scrobbleEnabled` — see `selectors/scrobbleRoutingSelectors.ts`. There is
 * deliberately no migration that writes this field on load; a stored route
 * always wins once one exists, and everyone else keeps reading the derived
 * default forever.
 */
type ScrobbleRoutes = Partial<Record<ScrobbleDestinationKind, ScrobbleRoute>>;

interface ScrobblingSettingsState {
  /* Scrobbling. Now-playing follows scrobble — if a user opts out of one
   * they opt out of the other; broadcasting "listening now" only to hide
   * the finished listen was never a real user intent.
   *
   * Nothing selects this field on its own, but it is not dead:
   * `scrobbleRoutingSelectors.ts` reads it directly to derive a route
   * default for every server that predates per-destination routing. */
  serverScrobbleEnabled: boolean;
  /**
   * Per-server, per-destination scrobble route — see {@link ScrobbleRoutes}.
   * Keyed by server id. Absent for every server that existed before this
   * field: `scrobbleRoutingSelectors` derives a route from
   * `serverScrobbleEnabled` and ListenBrainz's own `scrobbleEnabled` in that
   * case, so there is nothing to migrate here.
   */
  scrobbleRoutes: Record<string, ScrobbleRoutes>;
}

const initialState: ScrobblingSettingsState = {
  serverScrobbleEnabled: true,
  scrobbleRoutes: {},
};

const scrobblingSlice = createSlice({
  name: 'settingsScrobbling',
  initialState,
  reducers: {
    setServerScrobbleEnabled(state, action: PayloadAction<boolean>) {
      state.serverScrobbleEnabled = action.payload;
    },
    /**
     * Sets exactly one destination's route for one server. A single field per
     * destination is what makes "at most one route" structural rather than
     * something call sites have to remember to enforce — setting 'direct'
     * here already means it isn't 'through-server' any more.
     */
    setScrobbleRoute(
      state,
      action: PayloadAction<{ serverId: string; destination: ScrobbleDestinationKind; route: ScrobbleRoute }>
    ) {
      const { serverId, destination, route } = action.payload;
      if (!state.scrobbleRoutes) state.scrobbleRoutes = {};
      state.scrobbleRoutes[serverId] = {
        ...state.scrobbleRoutes[serverId],
        [destination]: route,
      };
    },
  },
});

export const { setScrobbleRoute } = scrobblingSlice.actions;

export default scrobblingSlice.reducer;
