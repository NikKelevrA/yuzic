import { contentWidth, spacing } from '@/constants/design'
import { centringInset } from '@/features/layout/windowClass'

/**
 * The horizontal inset a list-mode row draws inside its own touch box.
 *
 * `LibraryItem` pads itself so the pressed-state background extends past the
 * artwork; the list has to account for it or the artwork sits too far in.
 */
export const LIST_ITEM_INSET = 4

/**
 * The margin a grid cell carries on each side.
 *
 * This lived in the settings slice, with a `setGridSpacing` reducer nothing
 * ever dispatched — so it was a stored, persisted, rehydrated 8 that no user
 * could reach and no screen could change. It is the spacing token it always
 * was. The helpers below still take it as an argument, since the arithmetic is
 * worth testing across widths rather than at one value.
 */
export const GRID_SPACING = spacing.sm

/**
 * Horizontal padding for a library list's content container.
 *
 * Sized so the thing you actually look at — a row's thumbnail in list mode, a
 * cell's cover art in grid mode — lands `spacing.page` from the screen edge in
 * both modes, since each already carries an inset of its own. Grid cells add
 * `gridSpacing` as a margin, so the gutter gives back only the difference; a
 * spacing wide enough on its own leaves no gutter rather than a negative one.
 *
 * In list mode it also carries the cap. A grid fills the window — that is
 * what the extra columns are for — but a list is a column of rows, and a row
 * 1300pt wide puts the title and the duration at opposite ends of an iPad
 * with nothing in between, so the leftover room becomes gutter and centres
 * it. A `FlashList` takes padding in its `contentContainerStyle` and rejects
 * anything else, which is why the cap is spelled as an inset rather than as a
 * `maxWidth`. On any window narrower than the cap — every phone — the extra
 * is zero and this is the gutter it always was.
 *
 * Whatever a screen draws *above* the items cancels this with a negative
 * margin of the same size, so headers and sort rows keep the page inset while
 * the rows under them are centred.
 */
export function libraryGutter(
  isGridView: boolean,
  gridSpacing: number,
  screenWidth: number
): number {
  if (isGridView) return Math.max(spacing.page - gridSpacing, 0)
  return spacing.page - LIST_ITEM_INSET + centringInset(screenWidth, contentWidth.readable)
}

/**
 * Width of one grid cell's artwork.
 *
 * Every cell carries `gridSpacing` of margin on both sides, so a row of
 * `columns` cells spends `columns * gridSpacing * 2` on margins — not
 * `(columns + 1) * gridSpacing`, which under-counts for every column past the
 * first and overflows the row.
 */
export function gridItemWidth(
  screenWidth: number,
  columns: number,
  gridSpacing: number,
  gutter: number
): number {
  const available = screenWidth - gutter * 2 - columns * gridSpacing * 2
  return Math.max(available / columns, 0)
}
