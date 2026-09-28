import React, { useCallback, useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { Text } from '@/components/Text'
import { useTranslation } from 'react-i18next'

import SkeletonTiles from '@/components/SkeletonTiles'
import { useTheme } from '@/features/theme/useTheme'
import {
  SECTION_GRID_GAP,
  SECTION_H_PADDING as H_PADDING,
} from '@/features/home/constants'
import SectionEmptyState from './SectionEmptyState'
import { getSectionItemWidth, sectionStyles } from './sectionStyles'

/**
 * One horizontal shelf on Home: a heading, and under it the four states the
 * row can be in.
 *
 * Six shelves had written this out each — the width memo, the skeleton, the
 * error branch, the empty branch, the `FlashList` and a local copy of
 * `sectionStyles` — and they had drifted in the ways copies do. Four spelled
 * their error and empty text in English, in an app that ships four languages,
 * while `SectionEmptyState` sat unused beside them. Two had no error branch at
 * all, so a failed request removed the shelf as though the library were simply
 * thin. One showed "nothing here yet" while its data was still loading.
 *
 * The states are the reason this exists rather than the list: a shelf that
 * forgets one is the bug, and there is now one place to forget it in.
 *
 * The heading is the caller's, because it is the part that genuinely differs —
 * a plain title, or a control that picks what the shelf shows.
 */
type ShelfCarouselProps<T> = {
  /** The usual heading. Ignored when `header` is given. */
  title?: string
  /** A heading of the caller's own — a genre picker, a "see all" chevron. */
  header?: React.ReactNode
  isLoading: boolean
  /** Left out only by a shelf whose data cannot fail. */
  isError?: boolean
  data: readonly T[]
  keyExtractor: (item: T) => string
  /** Handed the width so no shelf has to work it out again, and the index
   *  for the ones that play from a position. */
  renderItem: (info: { item: T; index: number; width: number }) => React.ReactElement
  skeletonVariant?: 'album' | 'artist'
  /**
   * What this shelf says when it has nothing.
   *
   * Left out by a shelf that would rather not be there at all: a heading over
   * an empty rail promises something and then does not deliver it, which the
   * random draw decided was worse than no shelf. Absent, the whole shelf —
   * heading included — is dropped once it is known to be empty.
   */
  emptyMessage?: string
  /**
   * Overrides the shared "couldn't load" line. Almost nothing should: the
   * localised one says what happened and what to check.
   */
  errorMessage?: string
}

export function ShelfCarousel<T>({
  title,
  header,
  isLoading,
  isError = false,
  data,
  keyExtractor,
  renderItem,
  skeletonVariant = 'album',
  emptyMessage,
  errorMessage,
}: ShelfCarouselProps<T>) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const { width: screenWidth } = useWindowDimensions()

  const width = useMemo(() => getSectionItemWidth(screenWidth), [screenWidth])

  const renderRow = useCallback(
    ({ item, index }: { item: T; index: number }) => renderItem({ item, index, width }),
    [renderItem, width],
  )

  // Nothing to show and nothing to say about it: the shelf goes, heading and
  // all, rather than standing there empty under its own promise.
  if (!isLoading && !emptyMessage && data.length === 0) return null

  // Loading first, so a shelf never says it is empty while it is still
  // filling — which is what "no albums in your library yet" during hydration
  // amounted to.
  const body = isLoading ? (
    <SkeletonTiles
      itemSize={width}
      gap={SECTION_GRID_GAP}
      horizontalPadding={H_PADDING}
      variant={skeletonVariant}
    />
  ) : isError ? (
    <SectionEmptyState message={errorMessage ?? t('common.loadFailed')} />
  ) : data.length === 0 && emptyMessage ? (
    <SectionEmptyState message={emptyMessage} />
  ) : (
    <FlashList
      horizontal
      data={data as T[]}
      keyExtractor={keyExtractor}
      overrideItemLayout={layout => {
        ;(layout as { size?: number }).size = width
      }}
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      contentContainerStyle={sectionStyles.scrollContent}
      ItemSeparatorComponent={() => <View style={{ width: SECTION_GRID_GAP }} />}
      renderItem={renderRow}
    />
  )

  return (
    <View style={sectionStyles.container}>
      {header ?? (title ? (
        <Text style={[sectionStyles.title, { color: colors.secondary }]}>{title}</Text>
      ) : null)}
      {body}
    </View>
  )
}
