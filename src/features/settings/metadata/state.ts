import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface MetadataSettingsState {
  /**
   * `metadata.enrich` — display-only artist-info / artwork gap-filling
   * (see `features/metadata`). Two entirely independent fallback chains: a
   * user can enable artist-info without artwork or vice versa. Both default
   * empty/off, so a fresh install shows exactly the server's own data until
   * the user opts in, and disabling either chain (clearing its enabled map)
   * restores that server-only view with no code path change — the resolvers
   * simply have nothing to try.
   */
  metadataArtistInfoOrder: string[];
  metadataArtistInfoEnabled: Record<string, boolean>;
  metadataArtworkOrder: string[];
  metadataArtworkEnabled: Record<string, boolean>;
  /** Last.fm read-only metadata (similar artists, recommendation seeds). */
  lastfmEnabled: boolean;
}

const initialState: MetadataSettingsState = {
  metadataArtistInfoOrder: [],
  metadataArtistInfoEnabled: {},
  metadataArtworkOrder: [],
  metadataArtworkEnabled: {},
  lastfmEnabled: false,
};

const metadataSlice = createSlice({
  name: 'settingsMetadata',
  initialState,
  reducers: {
    setMetadataArtistInfoSourceEnabled(
      state,
      action: PayloadAction<{ sourceId: string; enabled: boolean }>
    ) {
      const { sourceId, enabled } = action.payload;
      if (!state.metadataArtistInfoEnabled) state.metadataArtistInfoEnabled = {};
      state.metadataArtistInfoEnabled[sourceId] = enabled;
      if (!state.metadataArtistInfoOrder) state.metadataArtistInfoOrder = [];
      if (enabled && !state.metadataArtistInfoOrder.includes(sourceId)) {
        state.metadataArtistInfoOrder.push(sourceId);
      }
    },
    setMetadataArtistInfoOrder(state, action: PayloadAction<string[]>) {
      state.metadataArtistInfoOrder = action.payload;
    },
    setMetadataArtworkSourceEnabled(
      state,
      action: PayloadAction<{ sourceId: string; enabled: boolean }>
    ) {
      const { sourceId, enabled } = action.payload;
      if (!state.metadataArtworkEnabled) state.metadataArtworkEnabled = {};
      state.metadataArtworkEnabled[sourceId] = enabled;
      if (!state.metadataArtworkOrder) state.metadataArtworkOrder = [];
      if (enabled && !state.metadataArtworkOrder.includes(sourceId)) {
        state.metadataArtworkOrder.push(sourceId);
      }
    },
    setMetadataArtworkOrder(state, action: PayloadAction<string[]>) {
      state.metadataArtworkOrder = action.payload;
    },
    setLastfmEnabled(state, action: PayloadAction<boolean>) {
      state.lastfmEnabled = action.payload;
    },
  },
});

export const {
  setMetadataArtistInfoSourceEnabled,
  setMetadataArtistInfoOrder,
  setMetadataArtworkSourceEnabled,
  setMetadataArtworkOrder,
  setLastfmEnabled,
} = metadataSlice.actions;

export default metadataSlice.reducer;

interface MetadataRootState {
  settingsMetadata: MetadataSettingsState;
}

export const selectMetadataArtistInfoOrder = (state: MetadataRootState): string[] =>
  state.settingsMetadata.metadataArtistInfoOrder;

export const selectMetadataArtistInfoSourceEnabled = (sourceId: string) =>
  (state: MetadataRootState): boolean => state.settingsMetadata.metadataArtistInfoEnabled?.[sourceId] ?? false;

export const selectMetadataArtworkOrder = (state: MetadataRootState): string[] =>
  state.settingsMetadata.metadataArtworkOrder;

export const selectMetadataArtworkSourceEnabled = (sourceId: string) =>
  (state: MetadataRootState): boolean => state.settingsMetadata.metadataArtworkEnabled?.[sourceId] ?? false;

export const selectLastfmEnabled = (state: MetadataRootState): boolean =>
  state.settingsMetadata.lastfmEnabled;
