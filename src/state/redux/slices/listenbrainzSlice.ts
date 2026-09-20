import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { removeServer } from '@/state/redux/slices/serversSlice';

/**
 * The user's token is NOT here. It goes to the keystore via `setCredential`
 * (scope `{ kind: 'integration', providerId: 'listenbrainz:<serverId>' }`,
 * field `token` — see `listenBrainzCredentialScope` in
 * `listenbrainzSelectors.ts`) because this slice is persisted to MMKV as
 * plain JSON. `useListenBrainzConfig` in the selectors file is what a caller
 * actually wants: it reads `username` from here and `token` from
 * `credentialCache` and hands back one config object, same as before.
 */
export interface PerServerListenBrainzState {
  username: string;
  isAuthenticated: boolean;
  /** Now-playing follows scrobble — a user who opts out of the finished
   * listen never wanted the in-progress broadcast either. */
  scrobbleEnabled: boolean;
}

interface ListenBrainzState {
  byServer: Record<string, PerServerListenBrainzState>;
}

const defaultPerServer: PerServerListenBrainzState = {
  username: '',
  isAuthenticated: false,
  scrobbleEnabled: false,
};

const initialState: ListenBrainzState = {
  byServer: {},
};

function getOrCreate(state: ListenBrainzState, serverId: string): PerServerListenBrainzState {
  if (!state.byServer[serverId]) {
    state.byServer[serverId] = { ...defaultPerServer };
  }
  return state.byServer[serverId];
}

const listenbrainzSlice = createSlice({
  name: 'listenbrainz',
  initialState,
  reducers: {
    setUsername(state, action: PayloadAction<{ serverId: string; value: string }>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.username = action.payload.value;
      entry.isAuthenticated = false;
    },
    setAuthenticated(state, action: PayloadAction<{ serverId: string; value: boolean }>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.isAuthenticated = action.payload.value;
    },
    setScrobbleEnabled(state, action: PayloadAction<{ serverId: string; value: boolean }>) {
      getOrCreate(state, action.payload.serverId).scrobbleEnabled = action.payload.value;
    },
    disconnect(state, action: PayloadAction<{ serverId: string }>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.username = '';
      entry.isAuthenticated = false;
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

export const {
  setUsername,
  setAuthenticated,
  setScrobbleEnabled,
  disconnect,
} = listenbrainzSlice.actions;

export default listenbrainzSlice.reducer;
