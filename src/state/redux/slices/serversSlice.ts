import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Server } from "@/providers/contracts/Server";

interface ServersState {
  servers: Server[];
  activeServerId: string | null;
  /**
   * Whether the one-time startup read of the keystore (`CredentialsGate`)
   * has landed in `credentialCache`. Not a secret itself — just a clock tick.
   * The gate renders nothing until it is true, so no secret-dependent hook
   * (`useApi`, the ListenBrainz/AudioMuse/downloader config hooks) ever runs
   * against the empty bundle `getCredentials` returns before the read.
   */
  credentialsHydrated: boolean;
}

const initialState: ServersState = {
  servers: [],
  activeServerId: null,
  credentialsHydrated: false,
};

const serversSlice = createSlice({
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