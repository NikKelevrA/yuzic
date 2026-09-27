import React from 'react'
import { render } from '@testing-library/react-native'

/**
 * The preview has one job: show what the app will draw. So the thing worth
 * testing is that it is handed the same paint.
 *
 * `useTheme` reports `colors.background` as transparent whenever a background
 * image is showing — right for a screen getting out of the photo's way, wrong
 * for a veil, which then veils nothing. The preview drew the photo brighter
 * than the app ever would, which is the one way a preview can be wrong while
 * still looking fine on its own.
 */

const PALETTE = { background: '#000', muted: '#222', border: '#333', subtext: '#aaa' }

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({
    // As `useTheme` really behaves with a photo showing.
    colors: { ...PALETTE, background: 'transparent' },
    palette: PALETTE,
    isDarkMode: true,
  }),
}))
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ panel: 24 }) }))
jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Pan: () => ({ onUpdate: () => ({ onFinalize: () => ({}) }) }) },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('@/features/theme/BackgroundPhoto', () => {
  const { View } = require('react-native')
  return { BackgroundPhoto: (props: Record<string, unknown>) => <View testID="photo" {...props} /> }
})

import { BackgroundCropEditor } from './BackgroundCropEditor'

const CROP = { x: 0.25, y: 0.5, zoom: 2 }

async function preview() {
  const view = await render(
    <BackgroundCropEditor uri="file:///a.jpg" blur={24} dim={0.6} crop={CROP} onChange={jest.fn()} />
  )
  return view.getByTestId('photo').props as Record<string, unknown>
}

describe('the background preview', () => {
  it('veils the photo in a colour that is actually a colour', async () => {
    expect((await preview()).veilColor).toBe('#000')
    expect((await preview()).veilColor).not.toBe('transparent')
  })

  it('draws with the blur, veil and crop the app will use', async () => {
    const props = await preview()
    expect(props.blur).toBe(24)
    expect(props.dim).toBe(0.6)
    expect(props.crop).toEqual(CROP)
  })
})
