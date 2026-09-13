import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Server } from "@/types";

interface ServersState {
  servers: Server[];
  activeServerId: string | null;
  /**
   * Whether the one-time startup read of the keystore (`hydrateAll` in
   * `src/app/_layout.tsx`) has landed in `credentialCache`. Not a secret
   * itself — just a clock tick — but it is what lets every secret-dependent
   * selector (`useApi`, the ListenBrainz/AudioMuse/downloader config hooks)
   * know to re-read the cache and re-render once real credentials are in it,
   * rather than staying stuck on the empty-bundle "not signed in" state they
   * render before hydration completes.
   */
  credentialsHydrated: boolean;
}

const initialState: ServersState = {
  servers: [],
  activeServerId: null,
  credentialsHydrated: false,
};

export const serversSlice = createSlice({
  name: "servers",
  initialState,
  reducers: {
    addServer: (state, action: PayloadAction<Server>) => {
      state.servers.push(action.payload);
    },

    updateServer: (
      state,
      action: PayloadAction<{ id: string; patch: Partial<Server> }>
    ) => {
      const server = state.servers.find(s => s.id === action.payload.id);
      if (server) {
        Object.assign(server, action.payload.patch);
      }
    },

    removeServer: (state, action: PayloadAction<string>) => {
      state.servers = state.servers.filter(s => s.id !== action.payload);
      if (state.activeServerId === action.payload) {
        state.activeServerId = null;
      }
    },

    setActiveServer: (state, action: PayloadAction<string | null>) => {
      state.activeServerId = action.payload;
    },

    disconnect: (state) => {
      state.activeServerId = null;
    },

    setCredentialsHydrated: (state, action: PayloadAction<boolean>) => {
      state.credentialsHydrated = action.payload;
    },
  },
});

export const {
  addServer,
  updateServer,
  removeServer,
  setActiveServer,
  disconnect,
  setCredentialsHydrated,
} = serversSlice.actions;

export default serversSlice.reducer;