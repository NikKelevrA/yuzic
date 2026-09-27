import { renderHook } from '@testing-library/react-native'

import { useOptionSheetBackground } from './sheetScaffold'

/**
 * A sheet is drawn over the screen, so it must cover a background image rather
 * than let it through.
 *
 * `useTheme` reports `colors.background` as transparent whenever a background
 * image is showing — right for a screen painting itself out of the way, wrong
 * for a panel on top of one. The sheet read it in its light-mode branch, so
 * every sheet in the app went see-through in light mode as soon as a photo
 * background was set, while dark mode (which reads `card`) looked fine.
 */

let mockIsDarkMode = false
const PALETTE = { background: '#F2F2F7', card: '#fff' }

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({
    isDarkMode: mockIsDarkMode,
    // As `useTheme` really behaves with an image showing: the page colour is
    // let through, the palette is not.
    colors: { ...PALETTE, background: 'transparent' },
    palette: PALETTE,
  }),
}))
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ lg: 16 }) }))

describe('useOptionSheetBackground over a background image', () => {
  it('stays opaque in light mode', async () => {
    mockIsDarkMode = false
    const { result } = await renderHook(() => useOptionSheetBackground())
    expect(result.current.backgroundColor).toBe('#F2F2F7')
  })

  it('stays opaque in dark mode', async () => {
    mockIsDarkMode = true
    const { result } = await renderHook(() => useOptionSheetBackground())
    expect(result.current.backgroundColor).toBe('#fff')
  })

  it('never reports a transparent surface', async () => {
    for (const dark of [false, true]) {
      mockIsDarkMode = dark
      const { result } = await renderHook(() => useOptionSheetBackground())
      expect(result.current.backgroundColor).not.toBe('transparent')
    }
  })
})
