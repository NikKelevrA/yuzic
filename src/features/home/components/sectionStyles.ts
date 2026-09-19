import { StyleSheet } from 'react-native'
import { spacing, typography } from '@/constants/design'
import { SHELF_GAP, SHELF_INSET, shelfItemWidth } from '@/features/layout/shelf'

const SECTION_GAP = SHELF_GAP
const SECTION_H_PADDING = SHELF_INSET

/**
 * How wide one tile on a Home shelf is drawn.
 *
 * The rule itself lives in `features/layout/shelf`, because the album
 * screen's shelves are the same shelf and used to carry their own copy of it.
 * Kept as a name here so the shelves that call it do not all have to learn a
 * new import path to get the same number.
 */
export const getSectionItemWidth = shelfItemWidth

export const sectionStyles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    marginBottom: spacing.md,
    marginLeft: SECTION_H_PADDING,
  },
  scrollContent: {
    paddingHorizontal: SECTION_H_PADDING,
  },
  item: {
    marginRight: SECTION_GAP,
    minWidth: 0,
  },
})
