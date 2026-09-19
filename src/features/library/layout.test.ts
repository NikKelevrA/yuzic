import { contentWidth, spacing } from '@/constants/design'
import { LIST_ITEM_INSET, gridItemWidth, libraryGutter } from './layout'

/** Narrower than the readable cap, so the gutter is the one it always was. */
const PHONE_WIDTH = 390

/** Where a list row's thumbnail starts, measured from the screen edge. */
const listArtEdge = (gridSpacing: number) =>
  libraryGutter(false, gridSpacing, PHONE_WIDTH) + LIST_ITEM_INSET

/** Where the first grid cell's cover art starts, measured from the screen edge. */
const gridArtEdge = (gridSpacing: number) =>
  libraryGutter(true, gridSpacing, PHONE_WIDTH) + gridSpacing

describe('libraryGutter', () => {
  it('lands list artwork on the page inset', () => {
    expect(listArtEdge(8)).toBe(spacing.page)
  })

  it('lands grid artwork on the page inset for any spacing up to it', () => {
    for (const gridSpacing of [0, 4, 8, 12, 16]) {
      expect(gridArtEdge(gridSpacing)).toBe(spacing.page)
    }
  })

  it('never returns a negative gutter when spacing exceeds the page inset', () => {
    expect(libraryGutter(true, 40, PHONE_WIDTH)).toBe(0)
  })

  it('lands list artwork the same page inset into a capped column on a tablet', () => {
    // Same statement as the phone case one line up, against the readable
    // column instead of the window: the rows are centred, and the artwork
    // sits `spacing.page` inside them rather than inside a 1366pt screen.
    const gutter = libraryGutter(false, 8, 1366)
    const betweenArtEdges = 1366 - (gutter + LIST_ITEM_INSET) * 2
    expect(betweenArtEdges).toBe(contentWidth.readable - spacing.page * 2)
  })

  it('leaves a grid alone on a tablet, because more columns is the answer there', () => {
    expect(libraryGutter(true, 8, 1366)).toBe(libraryGutter(true, 8, PHONE_WIDTH))
  })
})

describe('gridItemWidth', () => {
  it('fits a row of cells and their margins inside the screen', () => {
    for (const columns of [2, 3, 4]) {
      const gridSpacing = 8
      const gutter = libraryGutter(true, gridSpacing, PHONE_WIDTH)
      const width = gridItemWidth(390, columns, gridSpacing, gutter)
      const consumed = gutter * 2 + columns * (width + gridSpacing * 2)
      expect(consumed).toBeCloseTo(390)
    }
  })

  it('spaces cells evenly with the screen edge', () => {
    const gridSpacing = 8
    const gutter = libraryGutter(true, gridSpacing, PHONE_WIDTH)
    const width = gridItemWidth(390, 2, gridSpacing, gutter)
    // Edge-to-art and art-to-art gaps both come out at the page inset.
    expect(gutter + gridSpacing).toBe(spacing.page)
    expect(gridSpacing * 2).toBe(spacing.page)
    expect(width).toBeGreaterThan(0)
  })

  it('does not go negative when the columns cannot fit', () => {
    expect(gridItemWidth(200, 12, 16, 8)).toBe(0)
  })
})
