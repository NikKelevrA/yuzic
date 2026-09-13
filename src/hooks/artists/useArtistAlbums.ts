import { useMemo } from 'react'
import { useAlbums } from '@/hooks/albums'
import type { Album } from '@/domain/entities/Album'

// `artistId` is the artist's `nativeId` — every call site has it from a
// legacy screen artist object today, and the synced catalog is scoped to
// one active server at a time so a `nativeId` match is unambiguous.
export function useArtistAlbums(artistId: string): Album[] {
  const { albums } = useAlbums()
  return useMemo(
    () => albums.filter(a => a.artist.nativeId === artistId),
    [albums, artistId]
  )
}
