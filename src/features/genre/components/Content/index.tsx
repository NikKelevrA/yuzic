import React, { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'

import type { Album } from '@/domain/entities/Album'
import { useTheme } from '@/features/theme/useTheme'
import AlbumRow, { isExternalAlbum } from '@/components/rows/AlbumRow'
import GenreHeader, { GenreHeaderBar } from '../Header'
import { DetailScreen } from '@/components/DetailHeader'
import { useContentInset } from '@/features/layout/useContentInset'
import { spacing } from '@/constants/design'

type Props = {
  genre: string
  albums: Album[]
}

export default function GenreContent({ genre, albums }: Props) {
  const navigation = useNavigation<any>()
  const { colors } = useTheme()
  const { listInset, fullBleed } = useContentInset()

  const header = useMemo(
    () => <GenreHeader genre={genre} albums={albums} showNavigation={false} />,
    [genre, albums]
  )

  // This screen only ever hands `AlbumRow` a library album, but `onPress`
  // fires for either origin — guard with the exported `isExternalAlbum`
  // (provenance-based) rather than assuming.
  const renderItem = useCallback(
    ({ item }: { item: Album }) => (
      <AlbumRow
        album={item}
        onPress={(album) => {
          if (isExternalAlbum(album)) return;
          // Server adapter identity — becomes `useAlbum(id)` -> `api.albums.get(id)`.
          navigation.push('albumView', { id: album.nativeId });
        }}
      />
    ),
    [navigation]
  )

  return (
    <DetailScreen bar={<GenreHeaderBar genre={genre} albums={albums} />}>
      {scroll => (
      <FlashList
        data={albums}
        keyExtractor={(item) => item.localId}
        ListHeaderComponent={<View style={fullBleed}>{header}</View>}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: spacing.scrollClearance,
          backgroundColor: colors.background,
          ...listInset,
        }}
        {...scroll}
      />
      )}
    </DetailScreen>
  )
}
