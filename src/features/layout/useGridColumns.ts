import { useSelector } from 'react-redux'

import { selectGridColumns } from '@/features/settings/appearance/state'
import { gridColumnsFor } from './windowClass'
import { useWindowLayout } from './useWindowLayout'

/**
 * How many columns a grid should draw in this window.
 *
 * Every grid in the app reads this rather than `selectGridColumns` directly —
 * the setting is a density the user picked on a phone, and a screen that took
 * it literally drew three album covers the size of a hand on an iPad. Under a
 * phone in portrait it returns exactly the number the setting says, so the
 * slider still means what its label claims.
 */
export function useGridColumns(): number {
  const preferred = useSelector(selectGridColumns)
  const { width } = useWindowLayout()
  return gridColumnsFor(preferred, width)
}
