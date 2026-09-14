import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * The API token is NOT here — it goes to the keystore via `setCredential`
 * (scope `{ kind: 'integration', providerId: 'audiomuse:<serverId>' }`, field
 * `apiKey` — see `audiomuseCredentialScope` in `audiomuseSelectors.ts`)
 * because this slice is persisted to MMKV as plain JSON. `useAudiomuseConfig`
 * in the selectors file combines `serverUrl` from here with the token from
 * `credentialCache`.
 */
export interface AudiomuseConnection {
  serverUrl: string;
  isEnabled: boolean;
  isAuthenticated: boolean;
}

interface AudiomuseState {
  byServer: Record<string, AudiomuseConnection>;
}

const emptyConnection: AudiomuseConnection = {
  serverUrl: '',
  isEnabled: false,
  isAuthenticated: false,
};

const initialState: AudiomuseState = {
  byServer: {},
};

function getOrCreate(state: AudiomuseState, serverId: string): AudiomuseConnection {
  if (!state.byServer[serverId]) {
    state.byServer[serverId] = { ...emptyConnection };
  }
  return state.byServer[serverId];
}

type ServerRef = { serverId: string };

const audiomuseSlice = createSlice({
  name: 'audiomuse',
  initialState,
  reducers: {
    setAudiomuseServerUrl(state, action: PayloadAction<ServerRef & { value: string }>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.serverUrl = action.payload.value;
    },
    setAudiomuseAuthenticated(state, action: PayloadAction<ServerRef & { value: boolean }>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.isAuthenticated = action.payload.value;
      if (!action.payload.value) entry.isEnabled = false;
    },
    connectAudiomuse(state, action: PayloadAction<ServerRef>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.isAuthenticated = true;
      entry.isEnabled = true;
    },
    disconnectAudiomuse(state, action: PayloadAction<ServerRef>) {
      const entry = getOrCreate(state, action.payload.serverId);
      entry.serverUrl = '';
      entry.isEnabled = false;
      entry.isAuthenticated = false;
    },
  },
});

export const {
  setAudiomuseServerUrl,
  setAudiomuseAuthenticated,
  connectAudiomuse,
  disconnectAudiomuse,
} = audiomuseSlice.actions;

export default audiomuseSlice.reducer;
