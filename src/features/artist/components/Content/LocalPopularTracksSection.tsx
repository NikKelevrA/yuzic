import React from 'react'
import type { Artist } from '@/domain/entities/Artist'
import { useArtistTopTracks } from '@/features/artist/useArtistTopTracks'
import { useArtistCatalogueEnabled } from '@/providers/registry/artistSources'
import PopularTracksSection from './PopularTracksSection'

/**
 * A library artist's popular tracks are the catalogue's top tracks for that
 * name — gated by the catalogue being on in Online sources, a source
 * independent of `metadata.enrich` and the screen model (see
 * `useArtistScreenModel.ts`'s doc on `topTracks`). Its own component so this
 * hook call stays unconditional whichever row the artist list is rendering.
 */
export default function LocalPopularTracksSection({ artist }: { artist: Artist }) {
  const catalogueEnabled = useArtistCatalogueEnabled()
  const { topTracks } = useArtistTopTracks({
    name: artist.name,
    mbid: artist.externalIds.mbid,
    enabled: catalogueEnabled,
  })
  return <PopularTracksSection topTracks={topTracks} artistId={artist.nativeId} artistName={artist.name} />
}
