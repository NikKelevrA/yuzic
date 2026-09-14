import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type HomeShelfLength = 'compact' | 'standard' | 'generous';
export type HomeShelfTier = 'resume' | 'library' | 'server' | 'listenbrainz' | 'deezer';
const HOME_SHELF_LENGTHS: Record<HomeShelfLength, number> = {
  compact: 6,
  standard: 10,
  generous: 14,
};
const DEFAULT_SLEEP_TIMER_PRESETS = [5, 15, 30] as const;

interface HomeSettingsState {
  /* The server tier gets its own toggle because nothing else governs it. The
   * outside tiers are each source's Home-shelves use in `settingsSources`,
   * which decides whether that source may be asked at all. */
  homeServerSectionsEnabled: boolean;
  /** Per-shelf opt-outs. Missing keys read as visible for additive persistence. */
  homeShelfVisibility: Record<string, boolean>;
  /** Per-tier order. Missing tiers read in the product default order. */
  homeShelfOrder: Partial<Record<HomeShelfTier, string[]>>;
  /** Number of items in Home shelves; standard preserves the original layout. */
  homeShelfLength: HomeShelfLength;
  /** Quick-add sleep timer durations, in minutes. */
  sleepTimerPresets: number[];
  serverNowPlayingShelfEnabled: boolean;
}

const initialState: HomeSettingsState = {
  homeServerSectionsEnabled: true,
  homeShelfVisibility: {},
  homeShelfOrder: {},
  homeShelfLength: 'standard',
  sleepTimerPresets: [...DEFAULT_SLEEP_TIMER_PRESETS],
  // Default-on: cross-device continuity is what the user asked for by
  // opening the app on another device and expecting to see what's playing.
  serverNowPlayingShelfEnabled: true,
};

const homeSlice = createSlice({
  name: 'settingsHome',
  initialState,
  reducers: {
    setHomeServerSectionsEnabled(state, action: PayloadAction<boolean>) {
      state.homeServerSectionsEnabled = action.payload;
    },
    setHomeShelfVisibility(state, action: PayloadAction<{ key: string; visible: boolean }>) {
      if (!state.homeShelfVisibility) state.homeShelfVisibility = {};
      state.homeShelfVisibility[action.payload.key] = action.payload.visible;
    },
    setHomeShelfOrder(state, action: PayloadAction<{ tier: HomeShelfTier; order: string[] }>) {
      if (!state.homeShelfOrder) state.homeShelfOrder = {};
      state.homeShelfOrder[action.payload.tier] = action.payload.order;
    },
    setHomeShelfLength(state, action: PayloadAction<HomeShelfLength>) {
      state.homeShelfLength = action.payload;
    },
    setSleepTimerPresets(state, action: PayloadAction<number[]>) {
      state.sleepTimerPresets = action.payload;
    },
    setServerNowPlayingShelfEnabled(state, action: PayloadAction<boolean>) {
      state.serverNowPlayingShelfEnabled = action.payload;
    },
  },
});

export const {
  setHomeShelfVisibility,
  setHomeShelfOrder,
  setHomeShelfLength,
  setSleepTimerPresets,
  setServerNowPlayingShelfEnabled,
} = homeSlice.actions;

export default homeSlice.reducer;

interface HomeRootState {
  settingsHome: HomeSettingsState;
}

export const selectHomeServerSectionsEnabled = (state: HomeRootState): boolean =>
  state.settingsHome.homeServerSectionsEnabled;

export const selectHomeShelfVisibilityMap = (state: HomeRootState): Record<string, boolean> =>
  state.settingsHome.homeShelfVisibility;

export const selectHomeShelfLength = (state: HomeRootState): HomeShelfLength =>
  state.settingsHome.homeShelfLength;

export const selectHomeShelfItemCount = (state: HomeRootState): number =>
  HOME_SHELF_LENGTHS[selectHomeShelfLength(state)] ?? HOME_SHELF_LENGTHS.standard;

export const selectSleepTimerPresets = (state: HomeRootState): number[] => {
  const presets = state.settingsHome.sleepTimerPresets;
  return Array.isArray(presets) && presets.length > 0 ? presets : [...DEFAULT_SLEEP_TIMER_PRESETS];
};

export const selectHomeShelfOrder = (tier: HomeShelfTier, defaults: string[]) =>
  (state: HomeRootState): string[] => {
    const configured = state.settingsHome.homeShelfOrder?.[tier];
    if (!configured?.length) return defaults;
    const known = new Set(defaults);
    return [...configured.filter(key => known.has(key)), ...defaults.filter(key => !configured.includes(key))];
  };

export const selectServerNowPlayingShelfEnabled = (state: HomeRootState): boolean =>
  state.settingsHome.serverNowPlayingShelfEnabled;
