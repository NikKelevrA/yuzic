import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { usePrefetchCovers } from '@/features/library/usePrefetchCovers'
import { prefetchCovers } from '@/features/artwork/imageCache'
import { CATALOGUE_HOME_USE, fetchChartAlbums } from '@/providers/registry/homeDiscovery'
import { QueryKeys } from '@/state/query/queryKeys'
import { getDayKey } from '@/features/home/hooks/useDailyLayout'
import { useSourceUse } from '@/features/settings/sources/useSourceUse'
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation'
import { STALE_DEEZER_CHARTS } from '@/features/home/constants'
import { ShelfCarousel } from './ShelfCarousel'
import OptionsTile from './OptionsTile'
import type { Album } from '@/domain/entities/Album'
import { useRadius } from '@/features/theme/useRadius'

type Props = { refreshKey?: number }

export default function ChartsSection({ refreshKey = 0 }: Props) {
  const { t } = useTranslation()
  const rad = useRadius()
  const dayKey = getDayKey()
  const isEnabled = useSourceUse(CATALOGUE_HOME_USE)
  const { navigateToAlbum } = useMatchedNavigation()

  const query = useQuery<Album[]>({
    queryKey: [QueryKeys.ExploreCharts, dayKey, refreshKey],
    queryFn: () => fetchChartAlbums(10),
    enabled: isEnabled,
    staleTime: STALE_DEEZER_CHARTS,
    networkMode: 'online',
  })

  const data = useMemo(() => query.data ?? [], [query.data])
  const coversToPrefetch = useMemo(() => data.map(a => a.cover), [data])
  usePrefetchCovers(coversToPrefetch, 'grid')

  const renderAlbum = useCallback(({ item, width }: { item: Album; width: number }) => (
    <OptionsTile
      entity={{ kind: 'album', album: item }}
      cover={item.cover}
      title={item.title}
      subtitle={item.artist.name}
      size={width}
      radius={rad.card}
      onPress={() => {
        prefetchCovers([item.cover], 'detail')
        navigateToAlbum(item)
      }}
    />
  ), [navigateToAlbum, rad.card])

  return (
    <ShelfCarousel
      title={t('explore.sections.charts')}
      isLoading={query.isLoading}
      isError={query.isError}
      data={data}
      keyExtractor={item => item.localId}
      renderItem={renderAlbum}
      emptyMessage={t('explore.empty.charts')}
    />
  )
}
