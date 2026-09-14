import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface LyricsSettingsState {
  /**
   * Lyrics fallback chain, external sources only — server-embedded lyrics
   * are always tried first and are never part of this list (see
   * `features/lyrics/resolveLyrics`).
   *
   * `lyricsExternalSourcesOrder` names every external source the user has
   * touched, in their preferred try-order; `lyricsExternalSourcesEnabled`
   * says which of those are actually on. Both default empty/off — LRCLIB,
   * like every external source, is off until asked for, so a fresh install
   * behaves exactly like before this feature existed (server-only).
   */
  lyricsExternalSourcesOrder: string[];
  lyricsExternalSourcesEnabled: Record<string, boolean>;
}

const initialState: LyricsSettingsState = {
  lyricsExternalSourcesOrder: [],
  lyricsExternalSourcesEnabled: {},
};

const lyricsSlice = createSlice({
  name: 'settingsLyrics',
  initialState,
  reducers: {
    setLyricsExternalSourceEnabled(
      state,
      action: PayloadAction<{ sourceId: string; enabled: boolean }>
    ) {
      const { sourceId, enabled } = action.payload;
      if (!state.lyricsExternalSourcesEnabled) state.lyricsExternalSourcesEnabled = {};
      state.lyricsExternalSourcesEnabled[sourceId] = enabled;
      // A source enabled for the first time joins the order at the end; one
      // already present keeps its existing position rather than jumping to
      // the back every time it's re-enabled.
      if (!state.lyricsExternalSourcesOrder) state.lyricsExternalSourcesOrder = [];
      if (enabled && !state.lyricsExternalSourcesOrder.includes(sourceId)) {
        state.lyricsExternalSourcesOrder.push(sourceId);
      }
    },
    /** Replaces the whole try-order (drag-to-reorder writes the full array). */
    setLyricsExternalSourcesOrder(state, action: PayloadAction<string[]>) {
      state.lyricsExternalSourcesOrder = action.payload;
    },
  },
});

export const {
  setLyricsExternalSourceEnabled,
  setLyricsExternalSourcesOrder,
} = lyricsSlice.actions;

export default lyricsSlice.reducer;

interface LyricsRootState {
  settingsLyrics: LyricsSettingsState;
}

/**
 * Enabled external lyric sources, in the user's try-order.
 *
 * Filters `lyricsExternalSourcesOrder` down to the ones actually enabled
 * rather than trusting the order list alone, so a source that was disabled
 * without being removed from the order (or an id from a future version this
 * one doesn't recognise) never gets called.
 */
export const selectEnabledLyricsExternalSourcesInOrder = createSelector(
  [
    (state: LyricsRootState) => state.settingsLyrics.lyricsExternalSourcesOrder,
    (state: LyricsRootState) => state.settingsLyrics.lyricsExternalSourcesEnabled,
  ],
  // Memoized: `filter` builds a new array each call, and a selector that
  // returns a new reference for the same state re-renders every subscriber
  // and trips react-redux's identity check in development.
  (order, enabled): string[] => order.filter(sourceId => enabled[sourceId])
);

export const selectLyricsExternalSourcesOrder = (state: LyricsRootState): string[] =>
  state.settingsLyrics.lyricsExternalSourcesOrder;

export const selectLyricsExternalSourceEnabled = (sourceId: string) =>
  (state: LyricsRootState): boolean => state.settingsLyrics.lyricsExternalSourcesEnabled?.[sourceId] ?? false;
