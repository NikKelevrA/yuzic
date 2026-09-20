import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';

import {
  usesFor,
  usesOf,
  type SourceId,
  type SourcePurpose,
  type SourceServerUrls,
  type SourceUseId,
} from '@/providers/registry/sources';

interface SourcesSettingsState {
  /**
   * One switch per use (`<source>.<purpose>`). Absent reads as off: every
   * outside source starts off, and your library and server work without any.
   *
   * There is no separate "allowed" flag. A source is in use while any of its
   * uses is on; turning the first one on is when Yuzic asks, and stopping a
   * source turns all of them off. A second flag could sit on while every use
   * was off, which is a permission that grants nothing.
   */
  uses: Partial<Record<SourceUseId, boolean>>;
  /**
   * The address of a server of your own, for a source that can use one. Absent
   * means the public server. Kept apart from `uses` because it says where to
   * ask, not whether to: a source with an address and every use off sends
   * nothing anywhere.
   */
  serverUrls: SourceServerUrls;
}

const initialState: SourcesSettingsState = {
  uses: {},
  serverUrls: {},
};

const sourcesSlice = createSlice({
  name: 'settingsSources',
  initialState,
  reducers: {
    setSourceUse(state, action: PayloadAction<{ use: SourceUseId; enabled: boolean }>) {
      state.uses[action.payload.use] = action.payload.enabled;
    },
    /** Turns several uses on or off at once — onboarding's discovery choice. */
    setSourceUses(state, action: PayloadAction<{ uses: readonly SourceUseId[]; enabled: boolean }>) {
      for (const use of action.payload.uses) state.uses[use] = action.payload.enabled;
    },
    /** Sets the address of a server of your own; an empty one goes back to the public server. */
    setSourceServerUrl(state, action: PayloadAction<{ source: SourceId; url: string }>) {
      const { source } = action.payload;
      const url = action.payload.url.trim();
      // State persisted before addresses existed has no `serverUrls` at all.
      const next = { ...state.serverUrls };
      if (url) next[source] = url;
      else delete next[source];
      state.serverUrls = next;
    },
    /** Stops using a source everywhere. */
    stopUsingSource(state, action: PayloadAction<SourceId>) {
      for (const use of usesOf(action.payload)) delete state.uses[use.id];
    },
  },
});

export const { setSourceUse, setSourceUses, setSourceServerUrl, stopUsingSource } = sourcesSlice.actions;

export default sourcesSlice.reducer;

interface SourcesRootState {
  settingsSources: SourcesSettingsState;
}

export const selectSourceUses = (state: SourcesRootState): SourcesSettingsState['uses'] =>
  state.settingsSources.uses;

export const selectSourceUse = (use: SourceUseId) =>
  (state: SourcesRootState): boolean => state.settingsSources.uses[use] ?? false;

const NO_SERVER_URLS: SourceServerUrls = {};

/** The addresses set for sources you run yourself. Stable while unchanged, so it is safe to subscribe to. */
export const selectSourceServerUrls = (state: SourcesRootState): SourceServerUrls =>
  state.settingsSources?.serverUrls ?? NO_SERVER_URLS;

/** Whether any use of a source is on — whether Yuzic already talks to it. */
export const selectSourceInUse = (source: SourceId) =>
  (state: SourcesRootState): boolean => usesOf(source).some(use => state.settingsSources.uses[use.id]);

const enabledSourcesSelectors = new Map<SourcePurpose, (state: SourcesRootState) => SourceId[]>();

/**
 * The sources switched on for one purpose, in the order they are tried.
 * Memoised per purpose so a subscriber gets the same array until it changes.
 */
export const selectEnabledSourcesFor = (purpose: SourcePurpose) => {
  let selector = enabledSourcesSelectors.get(purpose);
  if (!selector) {
    selector = createSelector(
      [(state: SourcesRootState) => state.settingsSources.uses],
      uses => usesFor(purpose).filter(use => uses[use.id]).map(use => use.source)
    );
    enabledSourcesSelectors.set(purpose, selector);
  }
  return selector;
};

