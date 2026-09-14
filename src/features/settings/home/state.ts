import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type HomeShelfLength = 'compact' | 'standard' | 'generous';
export type HomeShelfTier = 'resume' | 'library' | 'server' | 'listenbrainz' | 'deezer';
export const HOME_SHELF_LENGTHS: Record<HomeShelfLength, number> = {
  compact: 6,
  standard: 10,
  generous: 14,
};
export const DEFAULT_SLEEP_TIMER_PRESETS = [5, 15, 30] as const;

interface HomeSettingsState {
  /* Home discovery source visibility. The server tier gets its own toggle
   * because nothing else governs it; the two external families are steered by
   * the integration settings that decide whether we may call them at all
   * (deezerDiscoveryEnabled, listenbrainzDiscoveryEnabled) rather than by a
   * second switch that could sit on while the first one is off. */
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
  /**
   * ListenBrainz's public similar-artist graph (Home shelf, artist page).
   * Needs no account, but it is still a third-party service being told which
   * artists this user listens to, so it waits to be asked for like every
   * other external source rather than being on because it happens to be free.
   */
  listenbrainzDiscoveryEnabled: boolean;
  /* Deezer has three distinct dimensions (Home shelves, search results,
   * external browse); everything else that used to be a sub-toggle (top
   * tracks, similar artists, album recs, samples, playlist recs) follows
   * deezerDiscoveryEnabled since they're all "should we ask Deezer to fill a
   * discovery surface". */
  deezerDiscoveryEnabled: boolean;
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
  listenbrainzDiscoveryEnabled: false,
  deezerDiscoveryEnabled: false,
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
    setListenbrainzDiscoveryEnabled(state, action: PayloadAction<boolean>) {
      state.listenbrainzDiscoveryEnabled = action.payload;
    },
    setDeezerDiscoveryEnabled(state, action: PayloadAction<boolean>) {
      state.deezerDiscoveryEnabled = action.payload;
    },
  },
});

export const {
  setHomeServerSectionsEnabled,
  setHomeShelfVisibility,
  setHomeShelfOrder,
  setHomeShelfLength,
  setSleepTimerPresets,
  setServerNowPlayingShelfEnabled,
  setListenbrainzDiscoveryEnabled,
  setDeezerDiscoveryEnabled,
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

/** Off until asked for: see the note on the field above. */
export const selectListenbrainzDiscoveryEnabled = (state: HomeRootState): boolean =>
  state.settingsHome.listenbrainzDiscoveryEnabled;

export const selectDeezerDiscoveryEnabled = (state: HomeRootState): boolean =>
  state.settingsHome.deezerDiscoveryEnabled;
