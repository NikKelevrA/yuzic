import { breakpoint } from '@/constants/design'

/**
 * How much room the window has, as a name rather than a number.
 *
 * Three classes, because three is how many genuinely different answers the
 * layouts have: draw one column (`compact`), draw one column with more in a
 * row (`medium`), or put two things side by side (`expanded`). A fourth would
 * be a size nothing behaves differently at.
 */
export type WindowClass = 'compact' | 'medium' | 'expanded'

/**
 * The widest a phone in portrait gets, in points.
 *
 * Every adaptive size below is expressed as "what this width already drew",
 * and each clamps at 1 here — so every phone, from a 320pt SE to a 440pt Pro
 * Max, keeps the exact layout it had before any of this existed, and only a
 * genuinely larger window moves.
 *
 * The widest rather than the typical, deliberately. Sizing off a 390pt iPhone
 * would have left every phone above it in the "grow a little" band, which is
 * a change to the covers on most phones shipped in the last five years in
 * exchange for nothing — they are phones.
 */
export const REFERENCE_WIDTH = 460

/**
 * The most columns a grid is allowed to reach.
 *
 * A backstop rather than the mechanism — `artworkScaleFor` is what keeps the
 * count sane — but a window can always be wider than anything anticipated,
 * and a hundred columns of one-pixel covers is not a layout.
 */
const MAX_GRID_COLUMNS = 8

/**
 * The largest artwork is allowed to get relative to the phone that sized it.
 *
 * Half again. Past that a shelf on a 13" iPad is four covers the size of
 * coasters, which is a poster rather than a library.
 */
const MAX_ARTWORK_SCALE = 1.5

/**
 * Which class this window is in.
 *
 * Width only. Height decides whether a *square* fits (see `squareArtSize`),
 * never whether there is room for a second column — a phone on its side is
 * 844×390 and wants the two-column player precisely because it is short.
 */
export function windowClassFor(width: number): WindowClass {
  if (width >= breakpoint.expanded) return 'expanded'
  if (width >= breakpoint.medium) return 'medium'
  return 'compact'
}

/** Whether the window is wider than it is tall. */
export function isLandscapeWindow(width: number, height: number): boolean {
  return width > height
}

/**
 * How much bigger a piece of artwork may be drawn in this window than on a
 * phone in portrait.
 *
 * The two honest extremes are both wrong. Scaling artwork with the window
 * gives a tablet three album covers the size of a hand; holding it fixed
 * gives a 13" iPad a wall of thumbnails and wastes the screen someone paid
 * for. So it grows, sub-linearly, and stops: the square root means doubling
 * the window makes the cover about 40% bigger and fits roughly 40% more of
 * them in, which is the trade a tablet layout is actually making.
 *
 * Exactly 1 at and below `REFERENCE_WIDTH`, so every phone keeps the sizes it
 * already had — including the ones wider than the reference, which is why
 * this clamps rather than starting from the window.
 */
export function artworkScaleFor(width: number): number {
  if (width <= REFERENCE_WIDTH) return 1
  return Math.min(MAX_ARTWORK_SCALE, Math.sqrt(width / REFERENCE_WIDTH))
}

/**
 * How many grid columns this width should draw.
 *
 * `preferred` is the user's own column count from Appearance, chosen while
 * looking at a phone — so it is read as a *tile size* rather than as a count,
 * and a wider window gets more tiles (a little larger, per
 * `artworkScaleFor`) rather than the same number of enormous ones. At
 * `REFERENCE_WIDTH` the answer is exactly `preferred`, by construction: an
 * untouched phone install does not move a pixel.
 */
export function gridColumnsFor(preferred: number, width: number): number {
  const columns = Math.max(1, Math.round(preferred))
  const nominalTile = (REFERENCE_WIDTH / columns) * artworkScaleFor(width)
  const fitted = Math.round(width / nominalTile)
  return Math.min(Math.max(fitted, columns), MAX_GRID_COLUMNS)
}

/**
 * The side of the largest square that fits, given the width it may use and
 * the height left over once everything below it has been measured.
 *
 * The player's artwork is the case this exists for. It was sized off the
 * window's *width* alone, which is the correct answer in portrait and a
 * catastrophic one the moment the window is short: a phone on its side asked
 * for an 800pt square in a 390pt-tall window, and the transport controls left
 * the screen entirely.
 */
export function squareArtSize(availableWidth: number, availableHeight: number): number {
  return Math.max(Math.min(availableWidth, availableHeight), 0)
}

/**
 * A column capped at `max` and never wider than the window it sits in.
 *
 * The cap is the point — see `contentWidth` in the design scale for why a row
 * is not allowed to grow to 1300pt — but a cap that ignores the window would
 * overflow a 320pt phone, so the window always wins when it is the smaller.
 */
export function cappedContentWidth(windowWidth: number, max: number): number {
  return Math.min(windowWidth, max)
}

/**
 * The padding on each side that centres a column capped at `max`.
 *
 * For the lists that cannot express the cap as a width — a `FlashList`
 * accepts padding in its `contentContainerStyle` and rejects anything else —
 * so the cap is spelled as the room left over beside it. Zero on any window
 * narrower than the cap, which is every phone.
 */
export function centringInset(windowWidth: number, max: number): number {
  return Math.max((windowWidth - max) / 2, 0)
}
