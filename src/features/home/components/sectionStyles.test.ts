import { SECTION_GRID_GAP, SECTION_H_PADDING } from '@/features/home/constants'
import { REFERENCE_WIDTH } from '@/features/layout/windowClass'
import { getSectionItemWidth } from './sectionStyles'

/** What a shelf spends on a row of `visible` tiles at this width. */
const consumed = (screenWidth: number, item: number, visible: number) =>
  SECTION_H_PADDING * 2 + item * visible + SECTION_GRID_GAP * (visible - 0.5)

/** How many tiles a shelf of this item width shows in this window. */
const visibleTiles = (screenWidth: number, item: number) =>
  (screenWidth - SECTION_H_PADDING * 2 + SECTION_GRID_GAP * 0.5) / (item + SECTION_GRID_GAP)

describe('getSectionItemWidth', () => {
  it('still draws two and a half tiles on every phone in portrait', () => {
    for (const width of [320, 360, 375, 390, 412, 430, REFERENCE_WIDTH]) {
      const item = getSectionItemWidth(width)
      expect(consumed(width, item, 2.5)).toBeCloseTo(width)
    }
  })

  it('grows the tile with the window, but nothing like as fast', () => {
    const phone = getSectionItemWidth(REFERENCE_WIDTH)
    let previous = phone
    for (const width of [768, 1024, 1366]) {
      const item = getSectionItemWidth(width)
      expect(item).toBeGreaterThanOrEqual(previous)
      // Never more than half again the phone's cover, whatever the window.
      // A hair of slack: the cap is reached exactly at 1366 and binary
      // floating point puts the product a billionth under the sum.
      expect(item).toBeLessThan(phone * 1.5 + 0.001)
      previous = item
    }
    // The window has tripled; the cover has not.
    expect(getSectionItemWidth(1366) / phone).toBeLessThan(1366 / REFERENCE_WIDTH)
  })

  it('shows more tiles on a wider window rather than the same few', () => {
    const phoneTiles = visibleTiles(REFERENCE_WIDTH, getSectionItemWidth(REFERENCE_WIDTH))
    const tabletTiles = visibleTiles(1366, getSectionItemWidth(1366))
    expect(phoneTiles).toBeCloseTo(2.5)
    expect(tabletTiles).toBeGreaterThan(5)
  })

  it('always leaves part of a tile showing, so the shelf says it scrolls', () => {
    for (const width of [390, 600, 768, 1024, 1366]) {
      const visible = visibleTiles(width, getSectionItemWidth(width))
      expect(visible % 1).toBeGreaterThan(0)
    }
  })

  it('moves smoothly through the widths a rotation passes on the way', () => {
    // No step: a drag that resizes a Split View must not make covers jump.
    let previous = getSectionItemWidth(360)
    for (let width = 361; width <= 1400; width += 1) {
      const item = getSectionItemWidth(width)
      expect(Math.abs(item - previous)).toBeLessThan(1)
      previous = item
    }
  })

  it('does not go negative in a window narrower than its own gutters', () => {
    expect(getSectionItemWidth(SECTION_H_PADDING * 2)).toBe(0)
    expect(getSectionItemWidth(0)).toBe(0)
  })
})
