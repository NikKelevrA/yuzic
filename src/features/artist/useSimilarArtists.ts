import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'

import { getLastFmSimilarArtists } from '@/providers/integration/lastfm/getSimilarArtists'
import { LASTFM_API_KEY } from '@/constants/keys'
import { QueryKeys } from '@/state/query/queryKeys'
import { selectSourceUse } from '@/features/settings/sources/state';
import type { Artist } from '@/domain/entities/Artist'
import { makeLocalId } from '@/domain/identity/LocalId'
import { integrationProvenance } from '@/domain/identity/Provenance'

type SimilarArtistsInput = {
  mbid?: string | null
  name?: string | null
  excludeName?: string | null
  limit?: number
  enabled?: boolean
}

async function fetchLastFmSimilarArtists(
  name: string,
  excludeName: string | undefined,
  limit: number
): Promise<Artist[]> {
  const candidates = await getLastFmSimilarArtists(LASTFM_API_KEY, name, limit * 3)
  if (!candidates.length) return []

  const normalizedExclude = excludeName?.trim().toLowerCase()
  const seen = new Set<string>()
  const provenance = integrationProvenance('lastfm')

  return candidates
    .filter(c => {
      const key = c.name.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      if (normalizedExclude && key === normalizedExclude) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map((c): Artist => {
      // Last.fm names no artist id of its own on this endpoint — its mbid
      // where present, else the artist's name, is all there is to key on.
      const nativeId = c.mbid ?? c.name
      return {
        localId: makeLocalId('artist', provenance, nativeId),
        nativeId,
        provenance,
        externalIds: c.mbid ? { mbid: c.mbid } : {},
        libraryState: 'external',
        name: c.name,
        cover: { kind: 'none' },
        tags: [],
        albumIds: [],
      }
    })
}

export function useSimilarArtists(input: SimilarArtistsInput) {
  const lastfmEnabled = useSelector(selectSourceUse('lastfm.similarArtists'))
  const queryKey = useMemo(
    () => [QueryKeys.ExploreSimilarArtists, input.mbid ?? input.name ?? '', input.limit ?? 8],
    [input.limit, input.mbid, input.name]
  )

  return useQuery({
    queryKey,
    queryFn: () => fetchLastFmSimilarArtists(input.name!, input.excludeName ?? undefined, input.limit ?? 8),
    // Two gates, both required: the user has to have turned Last.fm on, and
    // the build has to carry an api_key. Without the key this returns nothing
    // rather than firing a doomed request.
    enabled:
      lastfmEnabled &&
      (input.enabled ?? true) &&
      Boolean(input.name) &&
      Boolean(LASTFM_API_KEY),
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
  })
}
