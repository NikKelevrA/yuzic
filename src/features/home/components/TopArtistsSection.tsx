import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { usePrefetchCovers } from '@/features/library/usePrefetchCovers'
import { prefetchCovers } from '@/features/artwork/imageCache'
import { CATALOGUE_HOME_USE, fetchChartArtists } from '@/providers/registry/homeDiscovery'
import { QueryKeys } from '@/state/query/queryKeys'
import { getDayKey } from '@/features/home/hooks/useDailyLayout'
import { useSourceUse } from '@/features/settings/sources/useSourceUse'
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation'
import { STALE_DEEZER_CHARTS } from '@/features/home/constants'
import { ShelfCarousel } from './ShelfCarousel'
import OptionsTile from './OptionsTile'
import type { Artist } from '@/domain/entities/Artist'

type Props = { refreshKey?: number }

export default function TopArtistsSection({ refreshKey = 0 }: Props) {
  const { t } = useTranslation()
  const dayKey = getDayKey()
  const isEnabled = useSourceUse(CATALOGUE_HOME_USE)
  const { navigateToArtist } = useMatchedNavigation()


  const query = useQuery<Artist[]>({
    queryKey: [QueryKeys.ExploreTopArtists, dayKey, refreshKey],
    queryFn: () => fetchChartArtists(10),
    enabled: isEnabled,
    staleTime: STALE_DEEZER_CHARTS,
    networkMode: 'online',
  })

  const data = useMemo(() => query.data ?? [], [query.data])
  const coversToPrefetch = useMemo(() => data.map(a => a.cover), [data])
  usePrefetchCovers(coversToPrefetch, 'grid')

  const renderArtist = useCallback(({ item, width }: { item: Artist; width: number }) => (
    <OptionsTile
      entity={{ kind: 'artist', artist: item }}
      cover={item.cover}
      title={item.name}
      subtitle={t('common.artist')}
      size={width}
      radius={width / 2}
      onPress={() => {
        prefetchCovers([item.cover], 'detail')
        navigateToArtist(item)
      }}
    />
  ), [navigateToArtist, t])

  return (
    <ShelfCarousel
      title={t('explore.sections.topArtists')}
      isLoading={query.isLoading}
      isError={query.isError}
      data={data}
      keyExtractor={item => item.localId}
      renderItem={renderArtist}
      skeletonVariant="artist"
      emptyMessage={t('explore.empty.topArtists')}
    />
  )
}
