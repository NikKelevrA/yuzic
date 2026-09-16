import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, Grid2x2, List, ListFilter } from 'lucide-react-native'

import Touchable from '@/components/Touchable'
import { controlSize, hitSlopFor, iconSize, spacing, typography } from '@/constants/design'
import { useRadius } from '@/features/theme/useRadius'
import { useTheme } from '@/features/theme/useTheme'

/**
 * The row of controls above a list: how it is ordered, what it is filtered
 * to, and whether it is drawn as rows or as a grid.
 *
 * Lifted out of `LibraryList` so a screen that is not a library collection
 * can wear the same controls. `LibraryList` is typed to `LibraryItem` —
 * albums, artists, playlists and tracks — so Wants and Radio could not reach
 * it without pretending a station is one of those. The controls are not the
 * part that cared what the items were; the list is.
 *
 * Every control is optional, because not every list earns all three: a grid
 * of stations that have no logo is a grid of identical squares, and a filter
 * over one kind of thing is a control with one option.
 */

export type ListFilterOption<T extends string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  /** The current order, named. Omitted for a list with one sensible order. */
  sortLabel?: string
  onSortPress?: () => void
  /** Grid/list toggle. Omitted where a grid would say nothing a row doesn't. */
  isGridView?: boolean
  onToggleView?: () => void
  /** Filter chips, shown only when there is more than one thing to choose. */
  filters?: readonly ListFilterOption<T>[]
  activeFilter?: T
  onFilterChange?: (value: T) => void
}

export default function ListControls<T extends string>({
  sortLabel,
  onSortPress,
  isGridView,
  onToggleView,
  filters,
  activeFilter,
  onFilterChange,
}: Props<T>) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const rad = useRadius()

  const showSort = Boolean(sortLabel && onSortPress)
  const showToggle = isGridView !== undefined && Boolean(onToggleView)
  // One option is not a choice, and drawing it as one invites a tap that
  // changes nothing.
  const showFilters = Boolean(filters && filters.length > 1 && onFilterChange)

  if (!showSort && !showToggle && !showFilters) return null

  return (
    <View>
      <View style={styles.row}>
        {showSort ? (
          <Touchable
            testID="list-sort-button"
            style={[
              styles.sortButton,
              { backgroundColor: colors.muted, borderRadius: rad.pillFor(controlSize.inlineControl) },
            ]}
            onPress={onSortPress}
            accessibilityRole="button"
          >
            <ArrowUpDown size={iconSize.row} color={colors.secondary} />
            <Text style={[styles.sortLabel, { color: colors.secondary }]}>{sortLabel}</Text>
          </Touchable>
        ) : (
          // Holds the toggle at the right-hand end on a list with no sort,
          // rather than letting it slide over to where the sort pill sits.
          <View />
        )}

        {showToggle && (
          <Touchable
            testID="list-view-toggle"
            style={[
              styles.gridButton,
              { backgroundColor: colors.muted, borderRadius: rad.pillFor(controlSize.inlineControl) },
            ]}
            hitSlop={hitSlopFor(controlSize.inlineControl)}
            onPress={onToggleView}
            accessibilityRole="button"
            accessibilityLabel={
              isGridView ? t('library.view.switchToList') : t('library.view.switchToGrid')
            }
          >
            {isGridView
              ? <List size={iconSize.row} color={colors.secondary} />
              : <Grid2x2 size={iconSize.row} color={colors.secondary} />}
          </Touchable>
        )}
      </View>

      {showFilters && (
        <View style={styles.filterRow}>
          <ListFilter size={iconSize.row} color={colors.subtext} />
          {filters!.map(option => {
            const active = option.value === activeFilter
            return (
              <Touchable
                key={option.value}
                testID={`list-filter-${option.value}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.themeColor : colors.muted,
                    borderRadius: rad.pillFor(controlSize.inlineControl),
                  },
                ]}
                onPress={() => onFilterChange!(option.value)}
                accessibilityRole="button"
                // Which one is chosen is state, not a different button — a
                // label that changed with selection reads as a new control.
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: active ? colors.onThemeColor : colors.secondary },
                  ]}
                >
                  {option.label}
                </Text>
              </Touchable>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.inlineGap,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sortLabel: { ...typography.caption },
  gridButton: {
    width: controlSize.inlineControl,
    height: controlSize.inlineControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.inlineGap,
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.tight,
  },
  chipLabel: { ...typography.caption },
})
