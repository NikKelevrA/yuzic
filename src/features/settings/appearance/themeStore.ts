import { DEFAULT_THEME, normalizeTheme } from '@/features/theme/presets';
import { themeFromSettings, type ThemeSettingsV0, type Theme } from '@/features/theme/theme';

/**
 * How the appearance slice edits and upgrades the theme, kept apart from the
 * slice so the slice stays a list of settings.
 */

/**
 * A change to the theme: any of its parts, each merged one level deep, so an
 * edit to the dark palette's background leaves the rest of the palette alone.
 */
export type ThemeEdit = {
  accent?: string;
  accentFromCover?: boolean;
  palettes?: { light?: Partial<Theme['palettes']['light']>; dark?: Partial<Theme['palettes']['dark']> };
  shape?: Partial<Theme['shape']>;
  surface?: Partial<Theme['surface']>;
  components?: Partial<Theme['components']>;
};

export function applyThemeEdit(theme: Theme, edit: ThemeEdit): Theme {
  return {
    ...theme,
    accent: edit.accent ?? theme.accent,
    accentFromCover: edit.accentFromCover ?? theme.accentFromCover,
    palettes: {
      light: { ...theme.palettes.light, ...edit.palettes?.light },
      dark: { ...theme.palettes.dark, ...edit.palettes?.dark },
    },
    shape: { ...theme.shape, ...edit.shape },
    surface: { ...theme.surface, ...edit.surface },
    components: { ...theme.components, ...edit.components },
  };
}

/**
 * The upgrade to a stored theme.
 *
 * Before it the accent, corners, density, cover tint and dock were loose
 * fields in these settings. They become the theme, over the default look, so
 * nothing moves on upgrade. The old fields are dropped: left behind, they
 * would sit in storage looking like settings that do something.
 *
 * A development build briefly stored several themes (`activeThemeId` and
 * `customThemes`); one of those is carried across as the theme too.
 */
export function migrateAppearance(state: any): any {
  if (!state) return state;
  if (state.profiles) return state;
  if (state.theme) return intoProfiles(state);
  const {
    themeColor, radiusPreset, listDensity, coverAccentEnabled, translucentDock,
    activeThemeId, customThemes, ...rest
  } = state as ThemeSettingsV0 & Record<string, unknown> & { activeThemeId?: string; customThemes?: Theme[] };
  const earlier = customThemes?.find(t => (t as Theme & { id?: string }).id === activeThemeId);
  const theme: Theme = earlier
    ? normalizeTheme(earlier)
    : themeFromSettings({ themeColor, radiusPreset, listDensity, coverAccentEnabled, translucentDock }, DEFAULT_THEME);
  return intoProfiles({ ...rest, theme });
}

/**
 * The one stored theme becomes a list of profiles.
 *
 * A look that matches the default is *the* default — giving it a copy would
 * leave a new user with two identical profiles and a choice to make about
 * nothing. Anything else is the user's own, kept and selected, so an upgrade
 * changes what the setting is called and not how the app looks. It carries no
 * name: the app made it, so it wears a translated one until the user renames
 * it.
 */
function intoProfiles(state: any): any {
  const { theme, ...rest } = state as { theme?: Theme } & Record<string, unknown>;
  const stored = theme ? normalizeTheme(theme) : DEFAULT_THEME;
  const isStock = JSON.stringify(stored) === JSON.stringify(DEFAULT_THEME);
  if (isStock) {
    return { ...rest, profiles: [defaultProfile()], activeProfileId: DEFAULT_PROFILE_ID };
  }
  const mine: ThemeProfile = {
    id: 'p1',
    nameKey: 'settings.appearance.profiles.mine',
    theme: stored,
  };
  return { ...rest, profiles: [defaultProfile(), mine], activeProfileId: mine.id };
}

/* --- profiles --------------------------------------------------------------
 * A named look the user can switch between. The app ships one — the Yuzic
 * look — and it is not editable: it is the thing every other profile is a
 * departure from, and a reference that can be edited is not a reference. Any
 * edit made while it is selected forks a copy and lands on that instead, so
 * the rule never costs anyone a dead end. See `editActiveTheme` in the slice.
 */

export const DEFAULT_PROFILE_ID = 'default';

export type ThemeProfile = {
  id: string;
  /** A name the user typed. Absent on the ones the app made. */
  name?: string;
  /** A translation key, for the ones the app made and the user has not named. */
  nameKey?: string;
  theme: Theme;
};

/** The Yuzic look, always first in the list and always present. */
export const defaultProfile = (): ThemeProfile => ({
  id: DEFAULT_PROFILE_ID,
  nameKey: 'settings.appearance.profiles.default',
  theme: DEFAULT_THEME,
});

/**
 * The next free `p<n>`.
 *
 * Counted rather than random so the reducers stay pure — a profile created
 * from the same state twice is the same profile, which is what makes them
 * testable and replayable — and reused rather than incremented forever, so a
 * user who makes and deletes profiles all afternoon does not end up at `p94`.
 */
export function nextProfileId(profiles: ThemeProfile[]): string {
  const taken = new Set(profiles.map(p => p.id));
  for (let n = 1; ; n++) {
    const id = `p${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Every background photo any profile is pointing at. */
export function referencedBackgroundUris(profiles: ThemeProfile[]): Set<string> {
  const uris = new Set<string>();
  for (const profile of profiles) {
    const background = profile.theme?.surface?.background;
    if (background?.kind === 'image' && background.uri) uris.add(background.uri);
  }
  return uris;
}


/**
 * Just the part of the appearance settings these helpers touch.
 *
 * Structural, so this module stays something the slice imports rather than
 * something that imports the slice — the two would otherwise be a cycle, and
 * the architecture gate would say so.
 */
export type ProfileHolder = { profiles: ThemeProfile[]; activeProfileId: string };

/**
 * The profile being edited, and the theme it holds.
 *
 * Falls back to the default when the stored id names a profile that is no
 * longer there — a deleted one, a shared blob from elsewhere — rather than
 * letting a missing profile crash every screen that asks what colour anything
 * is.
 */
export function activeProfile(state: ProfileHolder): ThemeProfile {
  return state.profiles.find(p => p.id === state.activeProfileId)
    ?? state.profiles[0]
    ?? defaultProfile();
}

/**
 * Applies a change to the look the user is on, forking the default first.
 *
 * Every theme setter goes through here, which is what keeps the rule in one
 * place: the Yuzic look is the thing other profiles are a departure from, so
 * it cannot itself be departed from. Editing while it is selected copies it,
 * switches to the copy and edits that — so the rule never blocks an edit, and
 * the profile row at the top of Appearance changes its name to say what
 * happened.
 */
export function editActiveTheme(state: ProfileHolder, change: (theme: Theme) => Theme): void {
  let target = activeProfile(state);

  if (target.id === DEFAULT_PROFILE_ID) {
    const copy: ThemeProfile = {
      id: nextProfileId(state.profiles),
      nameKey: 'settings.appearance.profiles.mine',
      theme: target.theme,
    };
    state.profiles.push(copy);
    state.activeProfileId = copy.id;
    target = copy;
  }

  const index = state.profiles.findIndex(p => p.id === target.id);
  state.profiles[index] = { ...target, theme: change(normalizeTheme(target.theme)) };
}
