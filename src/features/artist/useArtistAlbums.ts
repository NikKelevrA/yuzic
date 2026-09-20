import { useMemo } from 'react'
import type { Album } from '@/domain/entities/Album'
import { albumsByArtistNativeId } from '@/features/library/catalogStore'
import { useCatalogStore } from '@/features/library/useCatalogStore'

/**
 * `artistId` is the artist's `nativeId` — every call site has it from a
 * screen's artist object, and the catalog is scoped to one active server at a
 * time so a `nativeId` match is unambiguous.
 *
 * This used to `albums.filter(a => a.artist.nativeId === artistId)`, a pass
 * over every album in the library per call. The relationship is indexed once
 * now; this is a map lookup.
 */
export function useArtistAlbums(artistId: string): Album[] {
  const store = useCatalogStore()
  return useMemo(() => albumsByArtistNativeId(store, artistId), [store, artistId])
}
