import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'

import { isLandscapeWindow, windowClassFor, type WindowClass } from './windowClass'

type WindowLayout = {
  /** The window's width in points — not the device's screen width. */
  width: number
  height: number
  landscape: boolean
  windowClass: WindowClass
  /**
   * Whether there is room to put two things beside each other.
   *
   * The one question most call sites are actually asking, so they ask it once
   * rather than each re-deriving it from `windowClass` and drifting over which
   * classes count.
   */
  twoColumn: boolean
}

/**
 * The window the screen is being drawn in, as the layouts think about it.
 *
 * One hook rather than `useWindowDimensions` at each call site, because the
 * derivations are the part that has to agree: "is this a tablet" was a literal
 * `width >= 768` inside the player and nothing anywhere else, so every other
 * screen answered the same question by not asking it.
 *
 * Re-renders on rotation and on a Split View resize, both of which arrive
 * through `useWindowDimensions` as an ordinary dimension change.
 */
export function useWindowLayout(): WindowLayout {
  const { width, height } = useWindowDimensions()
  return useMemo(() => {
    const windowClass = windowClassFor(width)
    return {
      width,
      height,
      landscape: isLandscapeWindow(width, height),
      windowClass,
      twoColumn: windowClass === 'expanded',
    }
  }, [width, height])
}
