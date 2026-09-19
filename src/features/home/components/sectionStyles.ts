import { StyleSheet } from 'react-native'
import { spacing, typography } from '@/constants/design'
import { SECTION_GRID_GAP, SECTION_H_PADDING } from '@/features/home/constants'
import { REFERENCE_WIDTH, artworkScaleFor } from '@/features/layout/windowClass'

/**
 * Home's shelves sit on the same page inset as every other screen.
 *
 * They were on 12 while the rest of the app was on 16, which survived the move
 * to the spacing scale by hiding behind a constant — the lint rule sees a
 * literal, not an identifier. Home is the first screen anyone opens, so it was
 * the worst place to be the odd one out.
 *
 * Re-exported rather than redeclared: half the shelves import it from here and
 * half from `features/home/constants`, and for a while those were two separate
 * numbers that only happened to agree.
 */
export { SECTION_H_PADDING }
const SECTION_GAP = SECTION_GRID_GAP

/**
 * How many tiles a shelf shows at once on a phone in portrait.
 *
 * The half is the affordance: a shelf that ended flush with the screen edge
 * read as a list of two, and nobody scrolled it.
 */
const SHELF_VISIBLE_COMPACT = 2.5

/**
 * Gaps drawn *between* `visible` tiles.
 *
 * Two and a half tiles have two gaps between them, and the general form of
 * "two" is `visible - 0.5` rather than `ceil(visible) - 1`: both give 2 here,
 * but only one of them is continuous, and a stepped gap count makes every
 * cover on the shelf jump 4pt as a rotation or a Split View drag carries the
 * window past each whole tile.
 *
 * This was also the app's one piece of shelf arithmetic that disagreed with
 * itself — seven shelves computed their width inline with `GAP * 2` while
 * this function used `GAP * (2.5 - 1)`, so Home drew two tile widths 2.4pt
 * apart depending on which shelf you were looking at. Two is the true one.
 */
const gapsBetween = (visible: number) => visible - 0.5

const widthFor = (available: number, visible: number) =>
  (available - SECTION_GAP * gapsBetween(visible)) / visible

/** The tile width a phone in portrait draws, which every other width scales from. */
const REFERENCE_ITEM = widthFor(
  REFERENCE_WIDTH - SECTION_H_PADDING * 2,
  SHELF_VISIBLE_COMPACT
)

/**
 * How wide one tile on a horizontal Home shelf is drawn.
 *
 * Two and a half tiles is the right answer on a phone and an absurd one on a
 * tablet: at 1366pt it asked for three album covers 530pt across, which is
 * the shape everyone recognises as a phone app that has been stretched. So
 * above a phone's width the tile takes its size from `artworkScaleFor` and
 * the *count* is what absorbs the rest of the window, always landing on a
 * fraction so a partial tile keeps saying the shelf scrolls.
 *
 * At and below `REFERENCE_WIDTH` the scale is 1 and the clamp holds the count
 * at two and a half, so every phone gets back exactly the width it drew
 * before this existed.
 */
export function getSectionItemWidth(screenWidth: number): number {
  const available = screenWidth - SECTION_H_PADDING * 2
  if (available <= 0) return 0
  const target = REFERENCE_ITEM * artworkScaleFor(screenWidth)
  const fitted = (available + SECTION_GAP * 0.5) / (target + SECTION_GAP)
  return widthFor(available, Math.max(SHELF_VISIBLE_COMPACT, fitted))
}

export const sectionStyles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    marginBottom: spacing.md,
    marginLeft: SECTION_H_PADDING,
  },
  scrollContent: {
    paddingHorizontal: SECTION_H_PADDING,
  },
  item: {
    marginRight: SECTION_GAP,
    minWidth: 0,
  },
})
