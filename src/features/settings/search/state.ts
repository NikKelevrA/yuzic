import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { HomeSettingsState } from '@/features/settings/home/state';

export type SearchScope = 'client' | 'server';

export interface SearchSettingsState {
  searchScope: SearchScope;
  /**
   * Which sources the user has opted into for the Search screen's "Other
   * sources" scope — independent of Home/discovery enablement and of the
   * per-source Settings pages. Keyed by source id (`deezer`, `musicbrainz`).
   * Absent keys read as off.
   */
  searchSourcesEnabled: Record<string, boolean>;
  deezerExternalEnabled: boolean;
  musicbrainzExternalEnabled: boolean;
}

const initialState: SearchSettingsState = {
  searchScope: 'server',
  searchSourcesEnabled: {},
  deezerExternalEnabled: false,
  musicbrainzExternalEnabled: false,
};

const searchSlice = createSlice({
  name: 'settingsSearch',
  initialState,
  reducers: {
    setSearchScope(state, action: PayloadAction<SearchScope>) {
      state.searchScope = action.payload;
    },
    /** Toggles one source's inclusion in Search's "Other sources" scope. */
    setSearchSourceEnabled(
      state,
      action: PayloadAction<{ sourceId: string; enabled: boolean }>
    ) {
      if (!state.searchSourcesEnabled) state.searchSourcesEnabled = {};
      state.searchSourcesEnabled[action.payload.sourceId] = action.payload.enabled;
    },
    setDeezerExternalEnabled(state, action: PayloadAction<boolean>) {
      state.deezerExternalEnabled = action.payload;
    },
    setMusicbrainzExternalEnabled(state, action: PayloadAction<boolean>) {
      state.musicbrainzExternalEnabled = action.payload;
    },
  },
});

export const {
  setSearchScope,
  setSearchSourceEnabled,
  setDeezerExternalEnabled,
  setMusicbrainzExternalEnabled,
} = searchSlice.actions;

export default searchSlice.reducer;

interface SearchRootState {
  settingsSearch: SearchSettingsState;
}

export const selectSearchScope = (state: SearchRootState): SearchScope =>
  state.settingsSearch.searchScope;

/**
 * Whether one source is enabled for the Search screen's "Other sources"
 * scope.
 */
export const selectSearchSourceEnabled = (sourceId: string) =>
  (state: SearchRootState): boolean =>
    state.settingsSearch.searchSourcesEnabled?.[sourceId] ?? false;

/** Every source id enabled for Search, independent of Home/discovery. */
export const selectEnabledSearchSourceIds = (state: SearchRootState): string[] => {
  const ids = new Set<string>(['deezer', 'musicbrainz']);
  return [...ids].filter(id => selectSearchSourceEnabled(id)(state));
};

export const selectDeezerExternalEnabled = (state: SearchRootState): boolean =>
  state.settingsSearch.deezerExternalEnabled;

export const selectMusicbrainzExternalEnabled = (state: SearchRootState): boolean =>
  state.settingsSearch.musicbrainzExternalEnabled;

/** Any Deezer-backed surface enabled anywhere (Home discovery or Search external browse). */
export const selectAnyDeezerEnabled = (
  state: SearchRootState & { settingsHome: HomeSettingsState }
): boolean =>
  state.settingsHome.deezerDiscoveryEnabled || state.settingsSearch.deezerExternalEnabled;
