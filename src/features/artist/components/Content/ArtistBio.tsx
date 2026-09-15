import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel'
import { metadataSourceNameKey } from '@/providers/registry/enrichmentBroker'
import BioSection from './BioSection'

/**
 * The artist's biography and tags: the artist's own (from its server, or the
 * outside catalogue it was opened from) first, then — for whatever is still
 * missing — the Metadata › Artist info source, credited with a "via" line.
 */
export default function ArtistBio({ model }: { model: ArtistScreenModel }) {
  const { t } = useTranslation()
  const { artist, resolved } = model

  const biography = resolved?.biography
  // Only a filling source has a name here; the artist's own origin does not.
  const bioSourceKey = biography ? metadataSourceNameKey(biography.sourceId) : null

  return (
    <BioSection
      biography={biography?.value ?? artist?.biography}
      tags={resolved?.tags?.value ?? artist?.tags}
      enrichedSourceLabel={bioSourceKey ? t(bioSourceKey) : null}
    />
  )
}
