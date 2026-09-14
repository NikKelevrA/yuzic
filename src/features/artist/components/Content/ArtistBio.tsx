import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Artist } from '@/domain/entities/Artist'
import { useArtistDetails } from '@/features/artist/useArtistDetails'
import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel'
import { useArtistTopTracks } from '@/features/artist/useArtistTopTracks'
import { useArtistCatalogueEnabled } from '@/providers/registry/artistSources'
import { metadataSourceNameKey } from '@/providers/registry/enrichmentBroker'
import BioSection from './BioSection'

/**
 * The biography always comes from an external source: the catalogue's artist
 * record in local mode (a source independent of `metadata.enrich`, the same
 * switch as `LocalPopularTracksSection`), or the resolved external artist's
 * own field otherwise — or, when metadata enrichment is on and neither of those
 * has one, from `resolveArtistDetails`. Kept as its own resolution here rather
 * than reading `model.resolved.biography` directly because the model
 * deliberately does not depend on the catalogue switch — see its doc comment.
 */
export default function ArtistBio({ model }: { model: ArtistScreenModel }) {
  const { t } = useTranslation()
  const { artist, isLocal, resolved: coverResolved } = model
  const catalogueEnabled = useArtistCatalogueEnabled()
  const { biography: catalogueBio } = useArtistTopTracks({
    name: artist?.name ?? '',
    mbid: artist?.externalIds.mbid,
    enabled: isLocal && !!artist && catalogueEnabled,
  })

  const ownBio = isLocal ? (artist?.biography ?? catalogueBio) : artist?.biography
  const effectiveArtist: Artist | null = useMemo(() => {
    if (!artist) return null
    if (artist.biography || !isLocal) return artist
    return { ...artist, biography: catalogueBio }
  }, [artist, isLocal, catalogueBio])
  // Reuses the same broker-backed resolution as the cover (`coverResolved`)
  // whenever it already accounts for every field this artist has — which is
  // always true in external mode, and true in local mode exactly when there
  // is no catalogue bio to fold in. Only local mode with a catalogue-sourced
  // bio needs a second resolution, keyed on the bio-merged entity.
  const needsOwnResolution = isLocal && !!catalogueBio && !artist?.biography
  const ownResolution = useArtistDetails(needsOwnResolution ? effectiveArtist : null)
  const resolved = needsOwnResolution ? ownResolution : coverResolved

  const enrichedBio = !ownBio ? resolved?.biography?.value : undefined
  const enrichedSourceNameKey = !ownBio && resolved?.biography ? metadataSourceNameKey(resolved.biography.sourceId) : null

  return (
    <BioSection
      biography={ownBio ?? enrichedBio ?? undefined}
      enrichedSourceLabel={enrichedSourceNameKey ? t(enrichedSourceNameKey) : null}
    />
  )
}
