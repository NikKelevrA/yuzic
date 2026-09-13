import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SyncSettingsState {
  lastSyncedAt: number | null;
  syncOnAppStart: boolean;
}

const initialState: SyncSettingsState = {
  lastSyncedAt: null,
  syncOnAppStart: true,
};

const syncSlice = createSlice({
  name: 'settingsSync',
  initialState,
  reducers: {
    setLastSyncedAt(state, action: PayloadAction<number | null>) {
      state.lastSyncedAt = action.payload;
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
}

export const selectLastSyncedAt = (state: SyncRootState): number | null =>
  state.settingsSync.lastSyncedAt;

export const selectSyncOnAppStart = (state: SyncRootState): boolean =>
  state.settingsSync.syncOnAppStart;
