import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { removeServer } from '@/state/redux/slices/serversSlice';

/**
 * No credential lives here or anywhere else for this integration — the NAS
 * watchlist proxy is a LAN-only tool with no key or token (see
 * `providers/integration/playlistImport/client.ts`), so unlike AudioMuse or
 * ListenBrainz this slice is the *whole* config, safe to persist to MMKV as
 * plain JSON.
 */
export interface PlaylistImportConnection {
  serverUrl: string;
  isEnabled: boolean;
  isAuthenticated: boolean;
  /**
   * Last automatic-acquisition attempt per `${playlistId}:${spotifyId}`
   * (epoch ms). The watchlist proxy keeps listing a track as pending on every
   * poll until it actually resolves or its own 14-day retry window lapses —
   * this is what stops `usePlaylistImportSync` from re-sending the same
   * still-missing track to a downloader every cycle. Pruned to entries
   * younger than the caller's retention window on each write, so it never
   * grows unbounded.
   */
  attempted: Record<string, number>;
}

interface PlaylistImportState {
  byServer: Record<string, PlaylistImportConnection>;
}

const emptyConnection: PlaylistImportConnection = {
  serverUrl: '',
  isEnabled: false,
  isAuthenticated: false,
  attempted: {},
};

const initialState: PlaylistImportState = {
  byServer: {},
};

function getOrCreate(state: PlaylistImportState, serverId: string): PlaylistImportConnection {
  if (!state.byServer[serverId]) {
    state.byServer[serverId] = { ...emptyConnection, attempted: {} };
  }
  return state.byServer[serverId];
}

type ServerRef = { serverId: string };

const playlistImportSlice = createSlice({
  name: 'playlistImport',
  initialState,
  reducers: {
    setPlaylistImportServerUrl(state, action: PayloadAction<ServerRef & { value: string }>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.serverUrl = action.payload.value;
    },
    setPlaylistImportAuthenticated(state, action: PayloadAction<ServerRef & { value: boolean }>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.isAuthenticated = action.payload.value;
      if (!action.payload.value) entry.isEnabled = false;
    },
    connectPlaylistImport(state, action: PayloadAction<ServerRef>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.isAuthenticated = true;
      entry.isEnabled = true;
    },
    disconnectPlaylistImport(state, action: PayloadAction<ServerRef>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.serverUrl = '';
      entry.isEnabled = false;
      entry.isAuthenticated = false;
      entry.attempted = {};
    },
    /**
     * Records that acquisition was just attempted for a set of pending
     * tracks, pruning anything older than `retentionMs` in the same pass so
     * the map stays bounded without a separate cleanup pass.
     */
    recordPlaylistImportAttempts(
      state,
      action: PayloadAction<ServerRef & { keys: string[]; at: number; retentionMs: number }>
    ) {
      const entry = getOrCreate(state, action.payload.serverId);
      const { keys, at, retentionMs } = action.payload;
      const next: Record<string, number> = {};
      for (const [key, ts] of Object.entries(entry.attempted)) {
        if (at - ts < retentionMs) next[key] = ts;
      }
      for (const key of keys) next[key] = at;
      entry.attempted = next;
    },
  },
  /**
   * Forget a server the listener removed — same reasoning as the identical
   * `audiomuseSlice` extraReducer.
   */
  extraReducers: builder => {
    builder.addCase(removeServer, (state, action) => {
      delete state.byServer[action.payload];
    });
  },
});

export const {
  setPlaylistImportServerUrl,
  setPlaylistImportAuthenticated,
  connectPlaylistImport,
  disconnectPlaylistImport,
  recordPlaylistImportAttempts,
} = playlistImportSlice.actions;

export default playlistImportSlice.reducer;
