import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type SearchScope = 'client' | 'server';

interface SearchSettingsState {
  searchScope: SearchScope;
  /**
   * The one switch per outside catalogue (`deezer`, `musicbrainz`): may Search's
   * "Other sources" scope query it, and may its albums and artists open and
   * fill their pages. Absent keys read as off.
   *
   * Opening a result used to hang off a second, per-source "external data"
   * flag that only an orphaned settings page could set, so a search could list
   * a Deezer album that then would not open. A source you search is a source
   * you browse.
   */
  searchSourcesEnabled: Record<string, boolean>;
}

const initialState: SearchSettingsState = {
  searchScope: 'server',
  searchSourcesEnabled: {},
};

const searchSlice = createSlice({
  name: 'settingsSearch',
  initialState,
  reducers: {
    setSearchScope(state, action: PayloadAction<SearchScope>) {
      state.searchScope = action.payload;
    },
    /** Turns one outside catalogue on or off for search and its pages. */
    setSearchSourceEnabled(
      state,
      action: PayloadAction<{ sourceId: string; enabled: boolean }>
    ) {
      if (!state.searchSourcesEnabled) state.searchSourcesEnabled = {};
      state.searchSourcesEnabled[action.payload.sourceId] = action.payload.enabled;
    },
  },
});

export const {
  setSearchScope,
  setSearchSourceEnabled,
} = searchSlice.actions;

export default searchSlice.reducer;

type PersistedSearchSettings = Partial<SearchSettingsState> & {
  deezerExternalEnabled?: boolean;
  musicbrainzExternalEnabled?: boolean;
  [key: string]: unknown;
};

/**
 * Folds the retired per-source "external data" flags into the source switch.
 *
 * Whoever had a source's external pages on keeps them: the source is turned on
 * (which now also puts it in search). Nobody loses access they had; the flags
 * themselves are dropped.
 */
export function migrateSearchSettings<T extends PersistedSearchSettings | undefined>(persisted: T): T {
  if (!persisted) return persisted;
  const { deezerExternalEnabled, musicbrainzExternalEnabled, ...rest } = persisted;
  const searchSourcesEnabled: Record<string, boolean> = { ...(rest.searchSourcesEnabled ?? {}) };
  if (deezerExternalEnabled) searchSourcesEnabled.deezer = true;
  if (musicbrainzExternalEnabled) searchSourcesEnabled.musicbrainz = true;
  return { ...rest, searchSourcesEnabled } as T;
}

interface SearchRootState {
  settingsSearch: SearchSettingsState;
}

export const selectSearchScope = (state: SearchRootState): SearchScope =>
  state.settingsSearch.searchScope;

/** Whether one outside catalogue is on, for search and for its pages. */
export const selectSearchSourceEnabled = (sourceId: string) =>
  (state: SearchRootState): boolean =>
    state.settingsSearch.searchSourcesEnabled?.[sourceId] ?? false;

/** Every outside catalogue Search can query, on or off. */
export const SEARCH_SOURCE_IDS = ['deezer', 'musicbrainz'] as const;

/** Every source id enabled for Search, independent of Home/discovery. */
export const selectEnabledSearchSourceIds = (state: SearchRootState): string[] =>
  SEARCH_SOURCE_IDS.filter(id => selectSearchSourceEnabled(id)(state));
