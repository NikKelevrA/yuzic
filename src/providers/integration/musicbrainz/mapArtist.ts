/**
 * MusicBrainz artist DTO -> domain Artist.
 *
 * Mapping is the boundary: an `MbArtist` exists on this side of it and never
 * beyond. Provenance is passed in rather than constructed here, because the
 * mapper must be callable from a fixture test with no client at all.
 */
import type { Artist } from '@/domain/entities/Artist';
import { artistCoverSubject, missingCover } from '@/domain/entities/Cover';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { MbArtist } from './';

export function mapArtist(dto: MbArtist, provenance: Provenance): Artist {
  const nativeId = dto.id ?? '';

  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: nativeId ? { mbid: nativeId } : {},
    // Known only through MusicBrainz means browsed, not owned — whether it
    // becomes wanted/acquirable is a later policy decision this mapper has no
    // visibility into. See LibraryState.
    name: dto.name ?? 'Unknown Artist',
    // MusicBrainz's artist lookup/search responses used by this adapter carry
    // no picture of their own; the gap names the artist for a backup.
    cover: missingCover(artistCoverSubject(dto.name, nativeId ? { mbid: nativeId } : {})),
    biography: dto.annotation || undefined,
    // No tag data is requested by this adapter (would need `inc=tags`).
    tags: [],
    // Loaded separately by the album mapper, same as the Navidrome reference —
    // an artist's own DTO embedding release-groups is not treated as "loaded".
    albumIds: [],
  };
}
