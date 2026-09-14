import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SyncSettingsState {
  /**
   * When each server's catalog last synced, by server id. Per server because
   * the sync throttle is: one app-wide timestamp let a sync of one server keep
   * a newly added server from ever syncing.
   */
  lastSyncedAtByServer: Record<string, number>;
  syncOnAppStart: boolean;
}

const initialState: SyncSettingsState = {
  lastSyncedAtByServer: {},
  syncOnAppStart: true,
};

const syncSlice = createSlice({
  name: 'settingsSync',
  initialState,
  reducers: {
    setLastSyncedAt(state, action: PayloadAction<{ serverId: string; at: number }>) {
      state.lastSyncedAtByServer = { ...(state.lastSyncedAtByServer ?? {}), [action.payload.serverId]: action.payload.at };
    },
    setSyncOnAppStart(state, action: PayloadAction<boolean>) {
      state.syncOnAppStart = action.payload;
    },
  },
});

export const { setLastSyncedAt, setSyncOnAppStart } = syncSlice.actions;

export default syncSlice.reducer;

interface SyncRootState {
  settingsSync: SyncSettingsState;
  servers: { activeServerId: string | null };
}

/** When the active server last synced, or null if it never has. */
export const selectLastSyncedAt = (state: SyncRootState): number | null => {
  const serverId = state.servers.activeServerId;
  if (!serverId) return null;
  return state.settingsSync.lastSyncedAtByServer?.[serverId] ?? null;
};

export const selectSyncOnAppStart = (state: SyncRootState): boolean =>
  state.settingsSync.syncOnAppStart;
