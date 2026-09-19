/**
 * The window scale.
 *
 * Its own module rather than a section of `design.ts`, for the same reason
 * the type scale is: these are read by the layout functions in
 * `features/layout` as often as by a stylesheet, and `design.ts` is at the
 * size where one more scale is one too many. Re-exported from there, so every
 * style still keeps one import.
 */

/**
 * Where the window stops being a phone.
 *
 * Two numbers rather than a device check, because none of the things that
 * change above them are about the device: a phone turned on its side, an iPad
 * in Split View at a third of the screen, and a foldable half-open are each a
 * width the layout has to answer, and `Platform.isPad` answers none of them.
 *
 * They are Material's window-size-class thresholds, which is also where
 * Android draws its own "large screen" line — 600dp is the width above which
 * Android 16 ignores an activity's orientation lock outright, so a layout that
 * only works in portrait stops being a choice the app gets to make there.
 *
 * Measured against the window's width in points, never the device's screen: a
 * split-screen phone app is 300pt wide on a 900pt display, and the layout
 * belongs to the window it is drawn in.
 */
export const breakpoint = {
  /** A phone in portrait, or a narrow split. Below this, nothing changes. */
  medium: 600,
  /** Room to put two things side by side — a tablet, or a phone on its side. */
  expanded: 840,
} as const;

/**
 * How wide a single column of content may get before it is capped and centred.
 *
 * A row is readable at 400pt and absurd at 1300: the eye loses the line it is
 * on somewhere in between, and a track row whose title and duration are a foot
 * apart is the shape everyone recognises as a phone app on a tablet. These cap
 * the column; nothing here stretches anything.
 */
export const contentWidth = {
  /** A column of rows or prose — a library list, a settings screen, a detail body. */
  readable: 720,
  /**
   * The player's own column. 500 is the number the player already capped
   * itself at on a tablet, as a literal inside `PlayingScreen`; it is that
   * same number, named, so the portrait and landscape layouts cannot drift.
   */
  player: 500,
} as const;
