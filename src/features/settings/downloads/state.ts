import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DownloadsSettingsState {
  /** Auto-download songs newly added to the library after a sync. */
  autoDownloadNewSongs: boolean;
  /** Hold downloads until the device is on WiFi. Downloads are the one thing
   *  the app does that can run up a phone bill on its own, and auto-download
   *  runs without anyone asking, so this defaults to on. */
  downloadOnWifiOnly: boolean;
}

const initialState: DownloadsSettingsState = {
  autoDownloadNewSongs: false,
  downloadOnWifiOnly: true,
};

const downloadsSlice = createSlice({
  name: 'settingsDownloads',
  initialState,
  reducers: {
    setAutoDownloadNewSongs(state, action: PayloadAction<boolean>) {
      state.autoDownloadNewSongs = action.payload;
    },
    setDownloadOnWifiOnly(state, action: PayloadAction<boolean>) {
      state.downloadOnWifiOnly = action.payload;
    },
  },
});

export const { setAutoDownloadNewSongs, setDownloadOnWifiOnly } = downloadsSlice.actions;

export default downloadsSlice.reducer;

interface DownloadsRootState {
  settingsDownloads: DownloadsSettingsState;
}

export const selectAutoDownloadNewSongs = (state: DownloadsRootState): boolean =>
  state.settingsDownloads.autoDownloadNewSongs;

export const selectDownloadOnWifiOnly = (state: DownloadsRootState): boolean =>
  state.settingsDownloads.downloadOnWifiOnly;
