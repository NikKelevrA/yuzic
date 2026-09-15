import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type SearchScope = 'client' | 'server';

/**
 * Where a search runs. Which outside catalogues Search may query is each
 * source's search use in `settingsSources`, with every other outside switch.
 */
interface SearchSettingsState {
  searchScope: SearchScope;
}

const initialState: SearchSettingsState = {
  searchScope: 'server',
};

const searchSlice = createSlice({
  name: 'settingsSearch',
  initialState,
  reducers: {
    setSearchScope(state, action: PayloadAction<SearchScope>) {
      state.searchScope = action.payload;
    },
  },
});

export const { setSearchScope } = searchSlice.actions;

export default searchSlice.reducer;

interface SearchRootState {
  settingsSearch: SearchSettingsState;
}

export const selectSearchScope = (state: SearchRootState): SearchScope =>
  state.settingsSearch.searchScope;
