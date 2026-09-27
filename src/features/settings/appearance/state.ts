import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_LANGUAGE } from '@/features/settings/appearance/languages';
import type { ListDensity, RadiusPreset } from '@/constants/design';
import { DEFAULT_THEME, normalizeTheme } from '@/features/theme/presets';
import type { Theme } from '@/features/theme/theme';
import {
  DEFAULT_PROFILE_ID,
  activeProfile,
  applyThemeEdit,
  defaultProfile,
  editActiveTheme,
  nextProfileId,
  referencedBackgroundUris,
  type ThemeEdit,
  type ThemeProfile,
} from './themeStore';


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
  | 'downloaded'
  | 'wants'
  | 'radio';

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
  // A want is a title you are waiting on, and its row carries the status of
  // the thing you actually want to know — whether it is on its way. A grid
  // caption has no room for that, so this opens as rows.
  wants: false,
  // Stations have logos now, so a grid of them says something — but only for
  // the ones a directory had a logo for, and plenty have none. Rows first,
  // where a station that fell back to the radio mark still reads fine.
  radio: false,
};

export type PlayingBarAction = 'none' | 'skip' | 'favorite' | 'randomAlbum' | 'addToPlaylist' | 'cast';
export type ThemeMode = 'light' | 'dark' | 'system';
type AppLanguage = string;

interface AppearanceSettingsState {
  themeMode: ThemeMode;
  /**
   * The looks the user can switch between, the Yuzic one first and always
   * present.
   *
   * These used to be one stored theme, and before that loose settings here.
   * The setters below edit whichever profile is selected; see
   * {@link editActiveTheme} for why editing the default one lands somewhere
   * else.
   */
  profiles: ThemeProfile[];
  activeProfileId: string;
  /**
   * The accent taken from the cover of what is playing, while the theme asks
   * for one. Runtime only: it is left out of storage, since it is only ever
   * true of the track playing now.
   */
  liveAccent: string | null;
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
  language: AppLanguage;
  hapticsEnabled: boolean;
  /** When true, respect the system's reduce-motion setting; when false, always animate. */
  respectReducedMotion: boolean;
}

const initialState: AppearanceSettingsState = {
  themeMode: 'system',
  profiles: [defaultProfile()],
  activeProfileId: DEFAULT_PROFILE_ID,
  liveAccent: null,
  gridColumns: 3,
  isGridView: true,
  libraryViewModes: {},
  playingBarAction: 'skip',
  showQualityBadge: false,
  showSourceHeaders: true,
  language: DEFAULT_LANGUAGE,
  hapticsEnabled: true,
  respectReducedMotion: true,
};


const appearanceSlice = createSlice({
  name: 'settingsAppearance',
  initialState,
  reducers: {
    /** Switch to a profile, ignoring an id that is not there. */
    switchProfile(state, action: PayloadAction<string>) {
      if (state.profiles.some(p => p.id === action.payload)) state.activeProfileId = action.payload;
    },
    /**
     * A new profile, copied from the one in use and selected.
     *
     * A copy rather than a fresh default: someone making a profile is
     * usually about to change one thing about the look they are already
     * wearing, and starting from the stock look would make them rebuild it
     * first.
     */
    addProfile(state, action: PayloadAction<{ name: string }>) {
      const copy: ThemeProfile = {
        id: nextProfileId(state.profiles),
        name: action.payload.name,
        theme: normalizeTheme(activeProfile(state).theme),
      };
      state.profiles.push(copy);
      state.activeProfileId = copy.id;
    },
    /** Rename a profile. The default keeps its own name, being the app's. */
    renameProfile(state, action: PayloadAction<{ id: string; name: string }>) {
      if (action.payload.id === DEFAULT_PROFILE_ID) return;
      const profile = state.profiles.find(p => p.id === action.payload.id);
      if (!profile) return;
      profile.name = action.payload.name;
      // It had a name the app chose; it has the user's now.
      delete profile.nameKey;
    },
    /**
     * Delete a profile, falling back to the default if it was the one in use.
     *
     * The default cannot go: it is what deleting the last of the others
     * leaves you on, and a list of looks with nothing in it is not a state
     * worth being able to reach.
     */
    deleteProfile(state, action: PayloadAction<string>) {
      if (action.payload === DEFAULT_PROFILE_ID) return;
      state.profiles = state.profiles.filter(p => p.id !== action.payload);
      if (state.activeProfileId === action.payload) state.activeProfileId = DEFAULT_PROFILE_ID;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    /** Change any part of the theme. */
    editTheme(state, action: PayloadAction<ThemeEdit>) {
      editActiveTheme(state, theme => applyThemeEdit(theme, action.payload));
    },
    /** Put the colours back to the default, leaving the accent and everything else. */
    resetPalettes(state) {
      editActiveTheme(state, theme => ({ ...theme, palettes: DEFAULT_THEME.palettes }));
    },
    /** Picking an accent is choosing one, so it stops following the cover. */
    setThemeColor(state, action: PayloadAction<string>) {
      editActiveTheme(state, theme => applyThemeEdit(theme, { accent: action.payload, accentFromCover: false }));
    },
    setLiveAccent(state, action: PayloadAction<string | null>) {
      state.liveAccent = action.payload;
    },
    setRadiusPreset(state, action: PayloadAction<RadiusPreset>) {
      editActiveTheme(state, theme => applyThemeEdit(theme, { shape: { radius: action.payload } }));
    },
    setListDensity(state, action: PayloadAction<ListDensity>) {
      editActiveTheme(state, theme => applyThemeEdit(theme, { shape: { density: action.payload } }));
    },
    setCoverAccentEnabled(state, action: PayloadAction<boolean>) {
      editActiveTheme(state, theme => applyThemeEdit(theme, { surface: { coverTint: action.payload } }));
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
      editActiveTheme(state, theme => applyThemeEdit(theme, {
        components: { dock: action.payload ? 'translucent' : 'solid' },
      }));
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
  switchProfile,
  addProfile,
  renameProfile,
  deleteProfile,
  editTheme,
  resetPalettes,
  setLiveAccent,
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

export const selectProfiles = (state: AppearanceRootState): ThemeProfile[] =>
  state.settingsAppearance.profiles;

const selectActiveProfileId = (state: AppearanceRootState): string =>
  state.settingsAppearance.activeProfileId;

/** The profile in use, or the first one if the stored id names nothing. */
export const selectActiveProfile = createSelector(
  [selectProfiles, selectActiveProfileId],
  (profiles, id): ThemeProfile =>
    profiles.find(p => p.id === id) ?? profiles[0] ?? defaultProfile(),
);

/** The theme as saved, before a live accent is put in. For the one hook that follows the cover. */
export const selectStoredTheme = (state: AppearanceRootState): Theme =>
  selectActiveProfile(state).theme;
const selectLiveAccent = (state: AppearanceRootState) => state.settingsAppearance.liveAccent;

/**
 * The theme the app is drawn with.
 *
 * Memoised on the stored theme and the live accent, so it is the same object
 * until either changes. With `accentFromCover` on, the live accent stands in
 * for the theme's own. It is completed from the default: one saved before a field existed
 * must not reach a style as `undefined`.
 */
export const selectActiveTheme = createSelector(
  [selectStoredTheme, selectLiveAccent],
  (stored, liveAccent): Theme => {
    const theme = stored ? normalizeTheme(stored) : DEFAULT_THEME;
    return theme.accentFromCover && liveAccent ? { ...theme, accent: liveAccent } : theme;
  },
);

/**
 * The background photos every *other* profile is using.
 *
 * A photo is copied into the app's storage and deleted once the background
 * stops pointing at it. With profiles, two of them can point at the same file,
 * so "the background stopped pointing at it" is no longer the same question as
 * "anything is pointing at it" — deleting on the first would blank another
 * profile's background the moment this one was changed.
 */
export const selectBackgroundUrisInUseElsewhere = createSelector(
  [selectProfiles, selectActiveProfileId],
  (profiles, activeId): Set<string> =>
    referencedBackgroundUris(profiles.filter(p => p.id !== activeId)),
);

export const selectThemeColor = (state: AppearanceRootState): string =>
  selectActiveTheme(state).accent;

export const selectRadiusPreset = (state: AppearanceRootState): RadiusPreset =>
  selectActiveTheme(state).shape.radius;

export const selectListDensity = (state: AppearanceRootState): ListDensity =>
  selectActiveTheme(state).shape.density;

export const selectCoverAccentEnabled = (state: AppearanceRootState): boolean =>
  selectActiveTheme(state).surface.coverTint;

export const selectGridColumns = (state: AppearanceRootState): number =>
  state.settingsAppearance.gridColumns;

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
  selectActiveTheme(state).components.dock === 'translucent';

export const selectLanguage = (state: AppearanceRootState): AppLanguage =>
  state.settingsAppearance.language;

export const selectHapticsEnabled = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.hapticsEnabled;

export const selectRespectReducedMotion = (state: AppearanceRootState): boolean =>
  state.settingsAppearance.respectReducedMotion;
