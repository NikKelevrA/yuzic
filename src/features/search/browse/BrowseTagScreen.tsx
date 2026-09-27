import React, { useMemo, useState } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRoute } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'

import { DetailHeaderBar } from '@/components/DetailHeader'
import { CloudOff } from 'lucide-react-native'

import SkeletonListRow from '@/components/SkeletonListRow'
import SectionEmptyState from '@/features/home/components/SectionEmptyState'
import StatusBanner from '@/components/StatusBanner'
import { useIconSize } from '@/features/theme/useIconSize'
import { useAlbums } from '@/features/album/useAlbums'
import LibraryList from '@/features/library/LibraryList'
import { useSortLabels } from '@/features/library/useSortLabels'
import {
  EMPTY_SORT_STATS,
  sortItems,
  type LibraryItem,
  type SortOrder,
} from '@/features/library/librarySort'
import { useTheme } from '@/features/theme/useTheme'
import GenreHeader from '@/features/genre/components/Header'
import { albumsForTile, type BrowseTileKind } from './browseTiles'

/**
 * Everything under one tag, as a list.
 *
 * The same screen for a genre and for a mood, because they are the same kind of
 * question asked of a different tag — and the same `LibraryList` every other
 * collection uses, so it sorts, switches to a grid and scrolls like the rest of
 * the app rather than being a bespoke list that does none of that.
 */
type Params = { kind?: BrowseTileKind; label?: string }

export default function BrowseTagScreen() {
  const { params } = useRoute<{ key: string; name: string; params: Params }>()
  const { kind = 'genre', label: rawLabel = '' } = params ?? {}
  // Trimmed on the way in: the browse tiles are built from trimmed tag names
  // while the genre index passes the raw string, so a genre tagged " Jazz"
  // reached the two paths as two different tags.
  const label = rawLabel.trim()
  const { t } = useTranslation()
  const { colors } = useTheme()
  const sortLabels = useSortLabels()
  const icons = useIconSize()
  const { albums, isLoading, degraded } = useAlbums()

  const [sortOrder, setSortOrder] = useState<SortOrder>('title')

  const taggedAlbums = useMemo(() => albumsForTile(albums, kind, label), [albums, kind, label])

  const items = useMemo<LibraryItem[]>(
    () => sortItems(
      taggedAlbums.map(album => ({ kind: 'album' as const, data: album })),
      sortOrder,
      EMPTY_SORT_STATS
    ),
    [taggedAlbums, sortOrder]
  )

  // The tag names the screen; the subtitle says which kind of tag it is, since
  // "Melancholy" alone does not tell you whether it came from a genre field.
  const subtitle = `${t(`search.browse.${kind}`)} · ${t('library.count.albums', {
    count: items.length,
  })}`

  // The hero is only drawn once there are albums to draw it from, so the
  // other two states need a header of their own — without one there is no
  // back button and an empty tag is a dead end.
  const hasHero = !isLoading && items.length > 0

  // The hero bleeds under the status bar and insets itself; a safe-area edge
  // on top of that would leave a band of background above the artwork. The
  // plain-bar states still want the inset.
  return (
    <SafeAreaView
      testID="browse-tag-screen"
      edges={hasHero ? [] : ['top']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      {!hasHero && <DetailHeaderBar title={label} subtitle={subtitle} />}

      {degraded && (
        <StatusBanner
          icon={<CloudOff size={icons.badge} color={colors.subtext} />}
          text={t('common.serverUnreachableBanner')}
          closable
          testID="server-unreachable-banner"
        />
      )}

      {isLoading ? (
        // The library is still hydrating. Rows rather than a spinner, so the
        // screen is the shape it will be — the list used to appear empty and
        // then fill, which reads as "no albums under this tag".
        Array.from({ length: 6 }).map((_, index) => <SkeletonListRow key={index} />)
      ) : items.length === 0 ? (
        <SectionEmptyState message={t('search.browse.empty', { tag: label })} />
      ) : (
      <LibraryList
        items={items}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortLabel={sortLabels[sortOrder]}
        // The hero, the tag's name, and Play/Shuffle/Download-all — the
        // header the screen this replaced had. It went away during the
        // unification on the grounds that a plain bar was enough; it wasn't,
        // and this was the one detail screen in the app with no artwork on
        // it. Moods get it too: the header only ever needed a label and a
        // set of albums, and a mood has both.
        header={
          items.length > 0
            ? (
              <GenreHeader
                genre={label}
                albums={taggedAlbums}
                subtitle={subtitle}
              />
            )
            : undefined
        }
      />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
})
