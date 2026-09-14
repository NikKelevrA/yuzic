import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_LANGUAGE } from '@/features/settings/appearance/languages';
import type { ListDensity, RadiusPreset } from '@/constants/design';

/**
 * The collections that remember their own grid/list choice.
 *
 * Mirrors `LibraryCollectionType` in features/library/librarySort, kept here as
 * its own type so this slice doesn't reach up into a screen for it.
 */
type LibraryViewKey =
  | 'playlists'
  | 'albums'
  | 'artists'
  | 'tracks'
  | 'downloaded';

/**
 * What each collection shows before the user says otherwise.
 *
 * Artwork is the thing you scan an album or artist list for, so those are
 * grids. A track is a title — the art beside it is its album's, repeated once
 * per song on the record — so tracks and the mixed downloads list are rows,
 * where the title gets the width instead of a caption under a thumbnail.
 */
const LIBRARY_VIEW_DEFAULTS: Record<LibraryViewKey, boolean> = {
  playlists: true,
  albums: true,
  artists: true,
  tracks: false,
  downloaded: false,
};

export type PlayingBarAction = 'none' | 'skip' | 'favorite' | 'randomAlbum' | 'addToPlaylist' | 'cast';
export type ThemeMode = 'light' | 'dark' | 'system';
type AppLanguage = string;

interface AppearanceSettingsState {
  themeMode: ThemeMode;
  themeColor: string;
  /**
   * Corner-radius preset. Live-reactive — components read scaled values via
   * `useRadius()` and re-render on change. The static `radius` export in
   * constants/design.ts continues to hold defaults for unmigrated surfaces.
   */
  radiusPreset: RadiusPreset;
  /**
   * How much air sits between rows in a list. Live-reactive the same way the
   * radius preset is — rows read it through `useListDensity()`.
   */
  listDensity: ListDensity;
  /**
   * Tint a detail screen with a colour taken from its cover art. On by
   * default: it is most of what makes an album page look like that album.
   * Off gives every screen the flat theme background instead.
   */
  coverAccentEnabled: boolean;
  gridColumns: number;
  isGridView: boolean;
  /**
   * Per-collection overrides for {@link isGridView}.
   *
   * One flag used to drive every collection screen, so switching Tracks to a
   * list — which is what a list of 500 songs wants, since a three-up grid
   * truncates every title and shows the same artwork nine times — also flipped
   * Albums and Artists, where the grid is the right drawing. The kinds want
   * different answers, so they get to hold different ones.
   *
   * Absent keys fall back to `LIBRARY_VIEW_DEFAULTS` and then to `isGridView`,
   * which is what keeps this additive: a user upgrading with no overrides
   * stored sees the per-kind defaults, not a reset.
   */
  libraryViewModes: Partial<Record<LibraryViewKey, boolean>>;
  playingBarAction: PlayingBarAction;
  showQualityBadge: boolean;
  showSourceHeaders: boolean;
  /** Float the tab dock over the content behind a blur instead of having it
   * take layout space. Off by default: it only shows on screens long enough
   * to scroll under the dock, and it costs every list a taller bottom inset. */
  translucentDock: boolean;
  language: AppLanguage;
  hapticsEnabled: boolean;
  /** When true, respect the system's reduce-motion setting; when false, always animate. */
  respectReducedMotion: boolean;
}

/** The accent a fresh install starts with, and the first of the presets offered. */
export const THEME_DEFAULT_COLOR = '#ff7f7f';

const initialState: AppearanceSettingsState = {
  themeMode: 'system',
  themeColor: THEME_DEFAULT_COLOR,
  radiusPreset: 'default',
  listDensity: 'default',
  coverAccentEnabled: true,
  gridColumns: 3,
  isGridView: true,
  libraryViewModes: {},
  playingBarAction: 'skip',
  showQualityBadge: false,
  showSourceHeaders: true,
  translucentDock: false,
  language: DEFAULT_LANGUAGE,
  hapticsEnabled: true,
  respectReducedMotion: true,
};

const appearanceSlice = createSlice({
  name: 'settingsAppearance',
  initialState,
  reducers: {
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    setThemeColor(state, action: PayloadAction<string>) {
      state.themeColor = action.payload;
    },
    setRadiusPreset(state, action: PayloadAction<RadiusPreset>) {
      state.radiusPreset = action.payload;
    },
    setListDensity(state, action: PayloadAction<ListDensity>) {
      state.listDensity = action.payload;
    },
    setCoverAccentEnabled(state, action: PayloadAction<boolean>) {
      state.coverAccentEnabled = action.payload;
    },
    setGridColumns(state, action: PayloadAction<number>) {
      state.gridColumns = action.payload;
    },
    setIsGridView(state, action: PayloadAction<boolean>) {
      state.isGridView = action.payload;
    },
    setLibraryViewMode(
      state,
      action: PayloadAction<{ collection: LibraryViewKey; isGridView: boolean }>
    ) {
      state.libraryViewModes = {
        ...state.libraryViewModes,
        [action.payload.collection]: action.payload.isGridView,
      };
    },
    setPlayingBarAction(state, action: PayloadAction<PlayingBarAction>) {
      state.playingBarAction = action.payload;
    },
    setShowQualityBadge(state, action: PayloadAction<boolean>) {
      state.showQualityBadge = action.payload;
    },
    setShowSourceHeaders(state, action: PayloadAction<boolean>) {
      state.showSourceHeaders = action.payload;
    },
    setTranslucentDock(state, action: PayloadAction<boolean>) {
      state.translucentDock = action.payload;
    },
    setLanguage(state, action: PayloadAction<AppLanguage>) {
      state.language = action.payload;
    },
    setHapticsEnabled(state, action: PayloadAction<boolean>) {
      state.hapticsEnabled = action.payload;
    },
    setRespectReducedMotion(state, action: PayloadAction<boolean>) {
      state.respectReducedMotion = action.payload;
    },
  },
});

export const {
  setThemeMode,
  setThemeColor,
  setRadiusPreset,
  setListDensity,
  setCoverAccentEnabled,
  setGridColumns,
  setIsGridView,
  setLibraryViewMode,
  setPlayingBarAction,
  setShowQualityBadge,
  setShowSourceHeaders,
  setTranslucentDock,
  setLanguage,
  setHapticsEnabled,
  setRespectReducedMotion,
} = appearanceSlice.actions;

export default appearanceSlice.reducer;

/* --- selectors ------------------------------------------------------------
 * Typed against a minimal duck-typed shape rather than the full `RootState`
 * so this module never imports `@/state/redux/store` — that import would
 * cycle back here, since store.ts must import this file's reducer.
 */
interface AppearanceRootState {
  settingsAppearance: AppearanceSettingsState;
}

export const selectThemeMode = (state: AppearanceRootState): ThemeMode =>
  state.settingsAppearance.themeMode;

export const selectThemeColor = (state: AppearanceRootState): string =>
  state.settingsAppearance.themeColor;

export const selectRadiusPreset = (state: AppearanceRootState): RadiusPreset =>
  state.settingsAppearance.radiusPreset;

export const selectListDensity = (state: AppearanceRootState): ListDensity =>
  state.settingsAppearance.listDensity;

export const selectCoverAccentEnabled = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.coverAccentEnabled;

export const selectGridColumns = (state: AppearanceRootState): number =>
  state.settingsAppearance.gridColumns;

export const selectIsGridView = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.isGridView;

/**
 * Grid or list for one collection.
 *
 * Two tiers, most specific first: what the user chose for *this* collection,
 * then what the kind defaults to — the old global flag is used only when no
 * collection is named at all.
 */
export const selectLibraryViewMode =
  (collection: LibraryViewKey | null) =>
  (state: AppearanceRootState): boolean => {
    if (!collection) return state.settingsAppearance.isGridView;
    return (
      state.settingsAppearance.libraryViewModes?.[collection] ??
      LIBRARY_VIEW_DEFAULTS[collection]
    );
  };

export const selectPlayingBarAction = (state: AppearanceRootState) =>
  state.settingsAppearance.playingBarAction;

export const selectShowQualityBadge = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.showQualityBadge;

export const selectShowSourceHeaders = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.showSourceHeaders;

export const selectTranslucentDock = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.translucentDock;

export const selectLanguage = (state: AppearanceRootState): AppLanguage =>
  state.settingsAppearance.language;

export const selectHapticsEnabled = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.hapticsEnabled;

export const selectRespectReducedMotion = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.respectReducedMotion;
