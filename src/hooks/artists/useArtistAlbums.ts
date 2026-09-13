import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { selectLibraryAlbums } from '@/utils/redux/selectors/librarySelectors'
import type { Album } from '@/domain/entities/Album'

// `artistId` is the artist's `nativeId` — every call site has it from a
// legacy screen artist object today, and the synced library is scoped to
// one active server at a time so a `nativeId` match is unambiguous.
export function useArtistAlbums(artistId: string): Album[] {
  const albums = useSelector(selectLibraryAlbums)
  return useMemo(
    () => albums.filter(a => a.artist.nativeId === artistId),
    [albums, artistId]
  )
}
