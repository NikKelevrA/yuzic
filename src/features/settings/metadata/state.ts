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
  /**
   * The one Last.fm switch: bios and tags, similar artists, and playlist
   * recommendation seeds. Each of those sends artist names to Last.fm, so
   * they are one decision — not a bios entry in `metadataArtistInfoEnabled`
   * plus a second flag with no screen of its own.
   */
  lastfmEnabled: boolean;
}

const LASTFM = 'lastfm';

/**
 * Persist version 1: fold the Metadata screen's Last.fm bios entry into
 * `lastfmEnabled`. Either being on means the user had agreed to Last.fm, so
 * the merged switch starts on if either was.
 */
export function migrateMetadataSettings<T extends Partial<MetadataSettingsState> | undefined>(state: T): T {
  if (!state) return state;
  const { [LASTFM]: bios, ...otherArtistInfo } = state.metadataArtistInfoEnabled ?? {};
  return {
    ...state,
    metadataArtistInfoEnabled: otherArtistInfo,
    lastfmEnabled: Boolean(state.lastfmEnabled) || Boolean(bios),
  };
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
    setLastfmEnabled(state, action: PayloadAction<boolean>) {
      state.lastfmEnabled = action.payload;
      // Last.fm is still a step in the artist-info fallback chain.
      if (!state.metadataArtistInfoOrder) state.metadataArtistInfoOrder = [];
      if (action.payload && !state.metadataArtistInfoOrder.includes(LASTFM)) {
        state.metadataArtistInfoOrder.push(LASTFM);
      }
    },
  },
});

export const {
  setMetadataArtworkSourceEnabled,
  setLastfmEnabled,
} = metadataSlice.actions;

export default metadataSlice.reducer;

interface MetadataRootState {
  settingsMetadata: MetadataSettingsState;
}

export const selectMetadataArtistInfoOrder = (state: MetadataRootState): string[] =>
  state.settingsMetadata.metadataArtistInfoOrder;

export const selectMetadataArtworkOrder = (state: MetadataRootState): string[] =>
  state.settingsMetadata.metadataArtworkOrder;

export const selectMetadataArtworkSourceEnabled = (sourceId: string) =>
  (state: MetadataRootState): boolean => state.settingsMetadata.metadataArtworkEnabled?.[sourceId] ?? false;

export const selectLastfmEnabled = (state: MetadataRootState): boolean =>
  state.settingsMetadata.lastfmEnabled;
