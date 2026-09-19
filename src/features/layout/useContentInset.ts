import { useMemo } from 'react'

import { contentWidth } from '@/constants/design'
import { centringInset } from './windowClass'
import { useWindowLayout } from './useWindowLayout'

/**
 * How a list of rows stays readable on a window wider than a phone.
 *
 * A row is the one shape that gets worse as it gets wider: at 1366pt a track
 * has its title against the left edge and its duration against the right with
 * a foot of nothing in between, and the eye loses which line it is on. So the
 * rows are capped and centred, and the padding that centres them is given
 * back to anything drawn full-bleed above or below — a hero and its colour
 * wash, a shelf of covers — which is the same trick, and the same pair of
 * numbers, that the library gutter already uses.
 *
 * Both are zero on any window narrower than the cap, which is every phone, so
 * nothing on a phone moves.
 */
export function useContentInset() {
  const { width } = useWindowLayout()
  const inset = centringInset(width, contentWidth.readable)
  return useMemo(
    () => ({
      /** Spread onto a list's `contentContainerStyle`. */
      listInset: { paddingHorizontal: inset },
      /** Spread onto whatever above or below the rows should still span the window. */
      fullBleed: { marginHorizontal: -inset },
    }),
    [inset]
  )
}
