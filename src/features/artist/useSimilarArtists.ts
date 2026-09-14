import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'

import { QueryKeys } from '@/state/query/queryKeys'
import { selectSourceUse } from '@/features/settings/sources/state';
import {
  fetchSimilarArtistsFromScrobbles,
  SCROBBLES_AVAILABLE,
  SCROBBLES_SIMILAR_USE,
} from '@/providers/registry/pageSources'

type SimilarArtistsInput = {
  mbid?: string | null
  name?: string | null
  excludeName?: string | null
  limit?: number
  enabled?: boolean
}

export function useSimilarArtists(input: SimilarArtistsInput) {
  const scrobblesEnabled = useSelector(selectSourceUse(SCROBBLES_SIMILAR_USE))
  const queryKey = useMemo(
    () => [QueryKeys.ExploreSimilarArtists, input.mbid ?? input.name ?? '', input.limit ?? 8],
    [input.limit, input.mbid, input.name]
  )

  return useQuery({
    queryKey,
    queryFn: () => fetchSimilarArtistsFromScrobbles(input.name!, input.excludeName ?? undefined, input.limit ?? 8),
    // Two gates, both required: the user has to have turned the source on,
    // and the build has to carry its key. Without the key this returns
    // nothing rather than firing a doomed request.
    enabled:
      scrobblesEnabled &&
      (input.enabled ?? true) &&
      Boolean(input.name) &&
      SCROBBLES_AVAILABLE,
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
  })
}
