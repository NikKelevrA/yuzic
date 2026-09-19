import { coverFade, onDark, themeColorPreset, tinted, veil } from './design'

describe('tinted', () => {
  it('appends the alpha for the strength asked for', () => {
    expect(tinted('#ff7f7f', 'selected')).toBe('#ff7f7f26')
    expect(tinted('#ff7f7f', 'surface')).toBe('#ff7f7f18')
  })

  it('produces a value React Native reads as a colour', () => {
    // Eight digits, not seven or nine: the bug this replaces was three files
    // each appending their own alpha to whatever `themeColor` happened to be.
    expect(tinted('#0be881', 'surface')).toMatch(/^#[0-9a-f]{8}$/i)
  })
})

describe('the colours the app states outright', () => {
  it('starts a fresh install on the first swatch offered', () => {
    // The default and the swatch row were two lists; this is what keeps the
    // chosen-state ring on the swatch a new user is actually looking at.
    expect(themeColorPreset[0]).toBe('#ff7f7f')
  })

  it('offers every preset as a six-digit hex, which `tinted` assumes', () => {
    for (const color of themeColorPreset) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('fades a cover from fully transparent to fully opaque', () => {
    for (const stops of [coverFade.onDark, coverFade.onLight]) {
      expect(stops).toHaveLength(3)
      expect(stops[0]).toMatch(/,\s*0\)$/)
      expect(stops[2]).toMatch(/,\s*1\)$/)
    }
  })

  it('keeps veils translucent — an opaque one would hide the wash behind it', () => {
    for (const value of Object.values(veil)) {
      const alpha = Number(value.match(/,([\d.]+)\)$/)![1])
      expect(alpha).toBeGreaterThan(0)
      expect(alpha).toBeLessThan(1)
    }
  })

  it('keeps the player wash and the opaque surface distinct', () => {
    // Both are "one step above black" and a step of grey apart. If they ever
    // become one value, one of them should be deleted rather than aliased.
    expect(onDark.wash).not.toBe(onDark.surface)
  })
})
