import { useQuery } from '@tanstack/react-query'
import { QueryKeys } from '@/enums/queryKeys'
import { ALL_SOURCES } from '@/features/sources/registry'
import type { Song } from '@/domain/entities/Song'
import type { Artist } from '@/domain/entities/Artist'

type Input = {
  name: string
  mbid?: string | null
  enabled: boolean
}

type Result = {
  topTracks: Song[]
  biography?: string
  similarArtists: Artist[]
  isLoading: boolean
}

export function useArtistTopTracks({ name, mbid, enabled }: Input): Result {
  const query = useQuery({
    queryKey: [QueryKeys.LocalArtistTopTracks, name],
    enabled: enabled && !!name,
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
    queryFn: async () => {
      const source = ALL_SOURCES[0]
      const resolved = await source.resolveArtist(name)
      if (!resolved) return null
      return source.fetchArtist(resolved.id, mbid)
    },
  })

  return {
    topTracks: query.data?.topTracks ?? [],
    biography: query.data?.artist.biography,
    similarArtists: query.data?.similarArtists ?? [],
    isLoading: query.isLoading,
  }
}
