import type { ListDensity, RadiusPreset, SemanticThemeColors } from '@/constants/design';
import { ensureContrast, isDark } from './color';

/**
 * The theme is data: everything about how the app looks, in one object.
 *
 * The app's look used to be spread across code — two palettes written inline
 * in `useTheme`, and an accent, a corner preset, a density, cover tinting and
 * the translucent dock each read from their own setting by whichever component
 * cared. Here they become one value, which the appearance settings edit in
 * place. There is one theme, and every option on it is the user's to change;
 * every hook that draws the app reads it, and none reads the settings directly.
 */

type Scheme = 'light' | 'dark';

/** A scheme's colours. The accent is the theme's, not the palette's. */
export type ThemePalette = Omit<SemanticThemeColors, 'themeColor'>;

/**
 * Which part of a photo the screen shows.
 *
 * Stored as a fraction of the *overflow* — how much bigger the photo is than
 * the screen once it has been scaled to fill — rather than as a rectangle in
 * the photo's own pixels. That is what `contentPosition` takes, and it is the
 * only form that survives a rotation, a different phone or an iPad: a pixel
 * rectangle is right for exactly one screen size and silently wrong on every
 * other. `0.5`/`0.5` is the centred crop the app has always drawn.
 *
 * `zoom` is a multiple of the fill, so `1` is "just covers" and there is
 * nothing to pan on the axis that already fits. Zooming in is what gives a
 * photo of the wrong shape something to pan along.
 */
export type ScreenBackgroundCrop = {
  /** 0 is the left edge of the photo, 1 the right. */
  x: number;
  /** 0 is the top edge of the photo, 1 the bottom. */
  y: number;
  /** 1 fills the screen; above that crops in further. */
  zoom: number;
};

export const DEFAULT_BACKGROUND_CROP: ScreenBackgroundCrop = { x: 0.5, y: 0.5, zoom: 1 };

export type ScreenBackgroundSource =
  | { kind: 'none' }
  /**
   * A photo the user picked, copied into the app's own storage.
   *
   * `crop` is optional because every photo chosen before this existed has
   * none, and the centred fill it falls back to is what those were already
   * showing. Only a photo carries one: the cover below changes with the track,
   * and there is no part of "whatever is playing" to choose.
   */
  | { kind: 'image'; uri: string; crop?: ScreenBackgroundCrop }
  /** The cover of whatever is playing, so the screen changes with the music. */
  | { kind: 'cover' };

export interface Theme {
  /** Both schemes, so the app follows the system's light and dark like it always has. */
  palettes: Record<Scheme, ThemePalette>;
  accent: string;
  /**
   * Take the accent from the cover of what is playing instead, falling back to
   * `accent` when nothing is. See `useLiveCoverAccent`.
   */
  accentFromCover: boolean;
  shape: {
    radius: RadiusPreset;
    density: ListDensity;
    /** A multiple of the type scale; one of `TEXT_SCALES`. Applies immediately. */
    textScale: number;
  };
  surface: {
    /** Tint a detail screen with a colour from its cover art. */
    coverTint: boolean;
    /** What the tab screens are drawn over: their plain colour, a photo, or what is playing. */
    background: ScreenBackgroundSource;
    /**
     * How far the background reaches: every tab's root screen, or every screen
     * in the app. `everywhere` excludes the full-screen player, which draws the
     * cover as its own background — two images layered read as a mistake rather
     * than a choice.
     *
     * There was a third setting, Home alone. It was dropped rather than fixed:
     * one tab wearing the photo and its two siblings not made the app look
     * half-themed, and it was the narrowest of three choices where two already
     * covered the intent — this tab bar's screens, or the whole app.
     * {@link normalizeTheme} carries a stored `home` across to `tabs`.
     */
    backgroundScope: 'tabs' | 'everywhere';
    /** Blur radius applied to the background image, in points. */
    backgroundBlur: number;
    /**
     * How much of the theme's background colour is laid over the image, from 0
     * to 1. It is a veil in the theme's own colour rather than black, so text
     * that reads on the plain background keeps reading as it rises.
     */
    backgroundDim: number;
  };
  components: {
    dock: 'solid' | 'translucent';
    /** Edge to edge along the bottom, or a rounded panel floating above it. */
    dockShape: 'edge' | 'floating';
    /** Names under the tab icons, for anyone who would rather read than recognise. */
    tabLabels: boolean;
    /** The player's cover: in the column, edge to edge, or small beside the title. */
    playerLayout: 'artwork' | 'fullWidth' | 'compact';
  };
}

/** The appearance settings a theme was built from before themes were stored: version 0 of `settingsAppearance`. */
export interface ThemeSettingsV0 {
  themeColor?: string;
  radiusPreset?: RadiusPreset;
  listDensity?: ListDensity;
  coverAccentEnabled?: boolean;
  translucentDock?: boolean;
}

/**
 * A theme from the settings that used to hold its parts: `base` with the old
 * accent, corners, density, tint and dock on top. Only the upgrade from those
 * settings uses it. A missing setting keeps the theme's own value.
 */
export function themeFromSettings(settings: ThemeSettingsV0, base: Theme): Theme {
  return {
    ...base,
    accent: settings.themeColor ?? base.accent,
    shape: {
      ...base.shape,
      radius: settings.radiusPreset ?? base.shape.radius,
      density: settings.listDensity ?? base.shape.density,
    },
    surface: { ...base.surface, coverTint: settings.coverAccentEnabled ?? base.surface.coverTint },
    components: {
      ...base.components,
      dock: settings.translucentDock === undefined
        ? base.components.dock
        : settings.translucentDock ? 'translucent' : 'solid',
    },
  };
}

/**
 * What goes on top of the accent — a label on a filled button, a glyph on a
 * filled tab.
 *
 * The palettes carry white, which is right for most accents and wrong for the
 * pale ones: the shipped yellow left its button labels at about 1.3:1, and an
 * accent taken from a cover can land anywhere. So it is decided against the
 * accent actually in use rather than stored, and `ensureContrast` falls back
 * to whichever of black and white reads best when neither clears the bar.
 */
const ON_ACCENT_CONTRAST = 4.5;

/** What `useTheme().colors` hands every component: one scheme's palette and the accent. */
export function colorsFor(theme: Theme, scheme: Scheme): SemanticThemeColors {
  const palette = theme.palettes[scheme];
  return {
    themeColor: theme.accent,
    ...palette,
    onThemeColor: ensureContrast(palette.onThemeColor, [theme.accent], ON_ACCENT_CONTRAST),
  };
}

/**
 * Whether the screens are drawn dark, which is what the status bar, the dock's
 * glass, ripples and skeletons have to match.
 *
 * It is the background's own shade, not the mode: a person can give the light
 * palette a black background, and a dark status bar over it is invisible.
 */
export function drawsDark(colors: SemanticThemeColors): boolean {
  return isDark(colors.background);
}
