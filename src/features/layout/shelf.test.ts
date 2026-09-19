import { SHELF_GAP, SHELF_INSET, shelfItemWidth } from './shelf'
import { REFERENCE_WIDTH } from './windowClass'

/** What a shelf spends on a row of `visible` tiles at this width. */
const consumed = (screenWidth: number, item: number, visible: number) =>
  SHELF_INSET * 2 + item * visible + SHELF_GAP * (visible - 0.5)

/** How many tiles a shelf of this item width shows in this window. */
const visibleTiles = (screenWidth: number, item: number) =>
  (screenWidth - SHELF_INSET * 2 + SHELF_GAP * 0.5) / (item + SHELF_GAP)

describe('shelfItemWidth', () => {
  it('still draws two and a half tiles on every phone in portrait', () => {
    for (const width of [320, 360, 375, 390, 412, 430, REFERENCE_WIDTH]) {
      const item = shelfItemWidth(width)
      expect(consumed(width, item, 2.5)).toBeCloseTo(width)
    }
  })

  it('grows the tile with the window, but nothing like as fast', () => {
    const phone = shelfItemWidth(REFERENCE_WIDTH)
    let previous = phone
    for (const width of [768, 1024, 1366]) {
      const item = shelfItemWidth(width)
      expect(item).toBeGreaterThanOrEqual(previous)
      // Never more than half again the phone's cover, whatever the window.
      // A hair of slack: the cap is reached exactly at 1366 and binary
      // floating point puts the product a billionth under the sum.
      expect(item).toBeLessThan(phone * 1.5 + 0.001)
      previous = item
    }
    // The window has tripled; the cover has not.
    expect(shelfItemWidth(1366) / phone).toBeLessThan(1366 / REFERENCE_WIDTH)
  })

  it('shows more tiles on a wider window rather than the same few', () => {
    const phoneTiles = visibleTiles(REFERENCE_WIDTH, shelfItemWidth(REFERENCE_WIDTH))
    const tabletTiles = visibleTiles(1366, shelfItemWidth(1366))
    expect(phoneTiles).toBeCloseTo(2.5)
    expect(tabletTiles).toBeGreaterThan(5)
  })

  it('always leaves part of a tile showing, so the shelf says it scrolls', () => {
    for (const width of [390, 600, 768, 1024, 1366]) {
      const visible = visibleTiles(width, shelfItemWidth(width))
      expect(visible % 1).toBeGreaterThan(0)
    }
  })

  it('moves smoothly through the widths a rotation passes on the way', () => {
    // No step: a drag that resizes a Split View must not make covers jump.
    let previous = shelfItemWidth(360)
    for (let width = 361; width <= 1400; width += 1) {
      const item = shelfItemWidth(width)
      expect(Math.abs(item - previous)).toBeLessThan(1)
      previous = item
    }
  })

  it('does not go negative in a window narrower than its own gutters', () => {
    expect(shelfItemWidth(SHELF_INSET * 2)).toBe(0)
    expect(shelfItemWidth(0)).toBe(0)
  })
})

/** Recently Played's density: three and a bit tiles, drawn tighter. */
const DENSE = { visible: 3.2, gap: 10 }

describe('a shelf with its own density', () => {
  it('shows exactly the tiles that density asks for on a phone', () => {
    for (const width of [320, 390, REFERENCE_WIDTH]) {
      const item = shelfItemWidth(width, DENSE)
      // 3.2 tiles show three whole gaps: the partial tile at the end is
      // preceded by one, which is the sum Recently Played used to get wrong.
      const spent = SHELF_INSET * 2 + item * DENSE.visible + DENSE.gap * 3
      expect(spent).toBeCloseTo(width)
    }
  })

  it('draws a denser shelf tile smaller than the default one', () => {
    expect(shelfItemWidth(REFERENCE_WIDTH, DENSE)).toBeLessThan(shelfItemWidth(REFERENCE_WIDTH))
  })

  it('grows its count, not its tiles, on a tablet — like every other shelf', () => {
    const phone = shelfItemWidth(REFERENCE_WIDTH, DENSE)
    const tablet = shelfItemWidth(1366, DENSE)
    expect(tablet).toBeGreaterThan(phone)
    expect(tablet).toBeLessThan(phone * 1.5 + 0.001)
  })

  it('moves smoothly at its own density too', () => {
    let previous = shelfItemWidth(360, DENSE)
    for (let width = 361; width <= 1400; width += 1) {
      const item = shelfItemWidth(width, DENSE)
      expect(Math.abs(item - previous)).toBeLessThan(1)
      previous = item
    }
  })
})
