import { breakpoint } from '@/constants/design'
import {
  REFERENCE_WIDTH,
  artworkScaleFor,
  cappedContentWidth,
  centringInset,
  gridColumnsFor,
  isLandscapeWindow,
  squareArtSize,
  windowClassFor,
} from './windowClass'

/** Every phone width the app is opened at, from an SE to a Pro Max. */
const PHONE_WIDTHS = [320, 360, 375, 390, 412, 430, REFERENCE_WIDTH]

/** Windows the app is actually opened in, so the cases are checkable by name. */
const WINDOWS = {
  phonePortrait: { width: 390, height: 844 },
  phoneLandscape: { width: 844, height: 390 },
  tabletPortrait: { width: 768, height: 1024 },
  tabletLandscape: { width: 1366, height: 1024 },
  /** An iPad running the app in a third of the screen — a phone-width window
   *  on a tablet, which is why none of this reads the device. */
  splitViewNarrow: { width: 320, height: 1024 },
}

describe('windowClassFor', () => {
  it('leaves a phone in portrait compact', () => {
    expect(windowClassFor(WINDOWS.phonePortrait.width)).toBe('compact')
  })

  it('treats a narrow split on a tablet as the phone it is the width of', () => {
    expect(windowClassFor(WINDOWS.splitViewNarrow.width)).toBe('compact')
  })

  it('calls a tablet in portrait medium and a phone on its side expanded', () => {
    expect(windowClassFor(WINDOWS.tabletPortrait.width)).toBe('medium')
    expect(windowClassFor(WINDOWS.phoneLandscape.width)).toBe('expanded')
  })

  it('changes class exactly at the breakpoints', () => {
    expect(windowClassFor(breakpoint.medium - 1)).toBe('compact')
    expect(windowClassFor(breakpoint.medium)).toBe('medium')
    expect(windowClassFor(breakpoint.expanded - 1)).toBe('medium')
    expect(windowClassFor(breakpoint.expanded)).toBe('expanded')
  })
})

describe('isLandscapeWindow', () => {
  it('reads the window rather than the device', () => {
    expect(isLandscapeWindow(WINDOWS.phoneLandscape.width, WINDOWS.phoneLandscape.height)).toBe(true)
    expect(isLandscapeWindow(WINDOWS.splitViewNarrow.width, WINDOWS.splitViewNarrow.height)).toBe(false)
  })

  it('calls a square window portrait rather than landscape', () => {
    expect(isLandscapeWindow(500, 500)).toBe(false)
  })
})

describe('artworkScaleFor', () => {
  it('leaves every phone exactly where it was', () => {
    for (const width of PHONE_WIDTHS) {
      expect(artworkScaleFor(width)).toBe(1)
    }
  })

  it('grows with the window but far more slowly than it', () => {
    const scale = artworkScaleFor(WINDOWS.tabletLandscape.width)
    expect(scale).toBeGreaterThan(1)
    expect(scale).toBeLessThan(WINDOWS.tabletLandscape.width / REFERENCE_WIDTH)
  })

  it('stops, rather than drawing a cover the size of a coaster', () => {
    expect(artworkScaleFor(4000)).toBe(artworkScaleFor(10000))
  })
})

describe('gridColumnsFor', () => {
  it('returns the user preference untouched on every phone in portrait', () => {
    for (const preferred of [2, 3, 4, 5]) {
      for (const width of PHONE_WIDTHS) {
        expect(gridColumnsFor(preferred, width)).toBe(preferred)
      }
    }
  })

  it('adds columns rather than growing the artwork on a wider window', () => {
    expect(gridColumnsFor(3, WINDOWS.tabletPortrait.width)).toBeGreaterThan(3)
    expect(gridColumnsFor(3, WINDOWS.tabletLandscape.width)).toBeGreaterThan(
      gridColumnsFor(3, WINDOWS.tabletPortrait.width)
    )
  })

  it('keeps the tile within half again of the size the phone drew it', () => {
    const phoneTile = REFERENCE_WIDTH / 3
    for (const width of [WINDOWS.tabletPortrait.width, WINDOWS.tabletLandscape.width, 1024]) {
      const tile = width / gridColumnsFor(3, width)
      expect(tile).toBeGreaterThan(phoneTile)
      expect(tile).toBeLessThan(phoneTile * 1.8)
    }
  })

  it('never returns fewer columns than the user asked for', () => {
    expect(gridColumnsFor(5, WINDOWS.splitViewNarrow.width)).toBe(5)
  })

  it('stops adding columns rather than drawing postage stamps', () => {
    expect(gridColumnsFor(5, 4000)).toBe(8)
  })

  it('survives a nonsense preference without dividing by zero', () => {
    expect(gridColumnsFor(0, REFERENCE_WIDTH)).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(gridColumnsFor(0, REFERENCE_WIDTH))).toBe(true)
  })
})

describe('squareArtSize', () => {
  it('is the width when the window is tall', () => {
    expect(squareArtSize(360, 600)).toBe(360)
  })

  it('is the height when the window is short — the landscape case', () => {
    expect(squareArtSize(800, 280)).toBe(280)
  })

  it('never goes negative once the chrome has taken more room than there is', () => {
    expect(squareArtSize(360, -40)).toBe(0)
  })
})

describe('cappedContentWidth', () => {
  it('caps a wide window and leaves a narrow one alone', () => {
    expect(cappedContentWidth(1366, 720)).toBe(720)
    expect(cappedContentWidth(390, 720)).toBe(390)
  })
})

describe('centringInset', () => {
  it('is nothing at all on a window narrower than the cap', () => {
    for (const width of PHONE_WIDTHS) {
      expect(centringInset(width, 720)).toBe(0)
    }
  })

  it('leaves exactly the capped column between the two insets', () => {
    const inset = centringInset(1366, 720)
    expect(1366 - inset * 2).toBe(720)
  })
})
