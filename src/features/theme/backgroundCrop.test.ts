import {
  MAX_ZOOM,
  isDefaultCrop,
  layoutFor,
  overflowFor,
  panned,
  withZoom,
} from './backgroundCrop'
import { DEFAULT_BACKGROUND_CROP } from './theme'

/**
 * The arithmetic behind a background photo's crop.
 *
 * A phone-shaped screen and a photo that is not phone-shaped: the numbers here
 * are the ones the preview in Settings and the background behind the app both
 * draw from, so an error shows up on every screen at once.
 */

const SCREEN = { width: 400, height: 800 }        // tall, like a phone
const WIDE = { width: 4000, height: 2000 }        // landscape photo
const SQUARE = { width: 1000, height: 1000 }

describe('overflowFor', () => {
  it('spills only sideways when a wide photo fills a tall screen', () => {
    // Filling 800pt of height scales the photo to 1600x800, so 1200pt of width
    // is off screen and there is nothing hidden vertically.
    expect(overflowFor(SCREEN, WIDE, 1)).toEqual({ width: 1200, height: 0 })
  })

  it('gives a square photo room to move sideways only once zoomed', () => {
    // Filling a tall screen from a square crops the sides to nothing spare...
    expect(overflowFor(SCREEN, SQUARE, 1)).toEqual({ width: 400, height: 0 })
    // ...and zooming enlarges both axes, so the top and bottom gain slack too.
    const zoomedOverflow = overflowFor(SCREEN, SQUARE, 2)
    expect(zoomedOverflow.width).toBe(1200)
    expect(zoomedOverflow.height).toBe(800)
  })

  it('never reports negative slack', () => {
    const o = overflowFor(SCREEN, SCREEN, 1)
    expect(o.width).toBe(0)
    expect(o.height).toBe(0)
  })

  it('is zero rather than NaN before anything has been measured', () => {
    expect(overflowFor({ width: 0, height: 0 }, WIDE, 1)).toEqual({ width: 0, height: 0 })
  })
})

describe('layoutFor', () => {
  it('centres by default, so an untouched photo draws as it always did', () => {
    const l = layoutFor(SCREEN, WIDE)!
    expect(l).toEqual({ left: -600, top: 0, width: 1600, height: 800 })
  })

  it('shows the photo left edge at x=0 and its right edge at x=1', () => {
    expect(layoutFor(SCREEN, WIDE, { x: 0, y: 0.5, zoom: 1 })!.left).toBe(0)
    expect(layoutFor(SCREEN, WIDE, { x: 1, y: 0.5, zoom: 1 })!.left).toBe(-1200)
  })

  it('always covers the screen, whatever the crop', () => {
    for (const x of [0, 0.5, 1]) {
      const l = layoutFor(SCREEN, SQUARE, { x, y: 0.5, zoom: 1.7 })!
      expect(l.width).toBeGreaterThanOrEqual(SCREEN.width)
      expect(l.height).toBeGreaterThanOrEqual(SCREEN.height)
      expect(l.left).toBeLessThanOrEqual(0)
      expect(l.left + l.width).toBeGreaterThanOrEqual(SCREEN.width)
      expect(l.top + l.height).toBeGreaterThanOrEqual(SCREEN.height)
    }
  })

  // The caller falls back to a centred cover, which is what shipped before
  // crops existed — a guessed size would draw the photo at the wrong scale for
  // one frame and then jump.
  it('declines to guess before the photo has loaded', () => {
    expect(layoutFor(SCREEN, null, DEFAULT_BACKGROUND_CROP)).toBeNull()
    expect(layoutFor(SCREEN, { width: 0, height: 0 })).toBeNull()
  })
})

describe('panned', () => {
  const overflow = { width: 1200, height: 0 }

  it('reveals the left of the photo when dragged right', () => {
    const next = panned({ x: 0.5, y: 0.5, zoom: 1 }, { dx: 600, dy: 0 }, overflow)
    expect(next.x).toBe(0)
  })

  it('stops at the edges instead of running past them', () => {
    expect(panned({ x: 0.5, y: 0.5, zoom: 1 }, { dx: 99999, dy: 0 }, overflow).x).toBe(0)
    expect(panned({ x: 0.5, y: 0.5, zoom: 1 }, { dx: -99999, dy: 0 }, overflow).x).toBe(1)
  })

  // Letting it drift would park the value off-centre invisibly, and the photo
  // would jump the moment a zoom gave that axis room.
  it('leaves an axis with nothing hidden exactly where it was', () => {
    const next = panned({ x: 0.5, y: 0.5, zoom: 1 }, { dx: 0, dy: 300 }, overflow)
    expect(next.y).toBe(0.5)
  })

  it('keeps the zoom it was given', () => {
    expect(panned({ x: 0.5, y: 0.5, zoom: 2.5 }, { dx: 10, dy: 10 }, overflow).zoom).toBe(2.5)
  })
})

describe('withZoom', () => {
  it('will not shrink below filling the screen', () => {
    expect(withZoom({ x: 0.5, y: 0.5, zoom: 1 }, 0.1).zoom).toBe(1)
  })

  it('stops at the maximum', () => {
    expect(withZoom({ x: 0.5, y: 0.5, zoom: 3 }, 99).zoom).toBe(MAX_ZOOM)
  })

  it('keeps the position it was given', () => {
    const next = withZoom({ x: 0.2, y: 0.8, zoom: 1 }, 2)
    expect([next.x, next.y]).toEqual([0.2, 0.8])
  })
})

describe('isDefaultCrop', () => {
  it('treats an absent crop as the centred fill', () => {
    expect(isDefaultCrop(undefined)).toBe(true)
    expect(isDefaultCrop(DEFAULT_BACKGROUND_CROP)).toBe(true)
  })

  it('spots any axis that has moved', () => {
    expect(isDefaultCrop({ x: 0.4, y: 0.5, zoom: 1 })).toBe(false)
    expect(isDefaultCrop({ x: 0.5, y: 0.5, zoom: 1.2 })).toBe(false)
  })
})
