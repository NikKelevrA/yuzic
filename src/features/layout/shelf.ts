import { spacing } from '@/constants/design'
import { REFERENCE_WIDTH, artworkScaleFor } from './windowClass'

/**
 * A horizontal shelf of covers — Home's rows, and the album screen's "More
 * by this artist" and "Similar albums".
 *
 * One owner, because there were three: Home's shelves, the album screen's
 * `ALBUM_RECOMMENDATION_*` constants, and `sectionStyles`, each with the same
 * 16 / 12 / 2.5 and two different opinions about how many gaps two and a half
 * tiles have. They agreed by coincidence rather than by construction, which
 * is the kind of agreement that ends the first time one of them is edited.
 */

/** The page inset a shelf starts at, like every other screen edge. */
export const SHELF_INSET = spacing.page

/** Between two covers on a shelf. */
export const SHELF_GAP = spacing.md

/**
 * How many tiles a shelf shows at once on a phone in portrait.
 *
 * The fraction is the affordance: a shelf that ended flush with the screen
 * edge read as a list of two, and nobody scrolled it.
 */
const SHELF_VISIBLE_COMPACT = 2.5

/**
 * Gaps drawn *between* the tiles on screen.
 *
 * Exactly `floor(visible)` of them: two and a half tiles show two gaps, and
 * three point two show three — the partial tile at the end is preceded by a
 * whole gap. Written as an offset from the shelf's own count rather than as
 * `Math.floor` so it is continuous, because a stepped gap count makes every
 * cover jump as a rotation or a Split View drag carries the window past each
 * whole tile. It is exact at the count the shelf was designed around, which
 * is the width every phone gets.
 *
 * This is where the shelves disagreed with each other. Seven Home shelves
 * used `GAP * 2` inline — correct — while `getSectionItemWidth` used
 * `GAP * (2.5 - 1)` and Recently Played used `GAP * (3.2 - 1)`, so one Home
 * screen drew three different tile widths for the same shelf shape.
 */
/** The partial tile a shelf always leaves showing — 0.5 of one, or 0.2. */
const peekOf = (compact: number) => compact - Math.floor(compact)

const gapsBetween = (visible: number, compact: number) => visible - peekOf(compact)

const widthFor = (available: number, visible: number, compact: number, gap: number) =>
  (available - gap * gapsBetween(visible, compact)) / visible

type ShelfOptions = {
  /** Tiles across on a phone. The fraction is the peek; it is never a whole number. */
  visible?: number
  /** Between two tiles. Its own value because the denser shelves draw tighter. */
  gap?: number
}

/**
 * How wide one tile on a horizontal shelf is drawn.
 *
 * Two and a half tiles is the right answer on a phone and an absurd one on a
 * tablet: at 1366pt it asked for three album covers 530pt across, which is
 * the shape everyone recognises as a phone app that has been stretched. So
 * above a phone's width the tile takes its size from `artworkScaleFor` and
 * the *count* is what absorbs the rest of the window, always landing on a
 * fraction so a partial tile keeps saying the shelf scrolls.
 *
 * At and below `REFERENCE_WIDTH` the scale is 1 and the clamp holds the count
 * where the shelf put it, so every phone gets back the width it drew before
 * this existed.
 */
export function shelfItemWidth(
  screenWidth: number,
  { visible = SHELF_VISIBLE_COMPACT, gap = SHELF_GAP }: ShelfOptions = {}
): number {
  const available = screenWidth - SHELF_INSET * 2
  if (available <= 0) return 0
  const reference = widthFor(REFERENCE_WIDTH - SHELF_INSET * 2, visible, visible, gap)
  const target = reference * artworkScaleFor(screenWidth)
  // `widthFor(available, v) = target` rearranged for v — how many tiles of
  // the size this window wants actually fit across it.
  const fitted = (available + gap * peekOf(visible)) / (target + gap)
  return widthFor(available, Math.max(visible, fitted), visible, gap)
}
