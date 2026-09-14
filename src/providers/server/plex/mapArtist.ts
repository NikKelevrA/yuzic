/**
 * Plex artist DTO -> domain Artist.
 *
 * Mapping is the boundary: a `PlexMetadata` exists on this side of it and
 * never beyond. Provenance is passed in rather than read from a client,
 * because the mapper must be callable from a fixture test with no client at
 * all — that is what makes these the one place a protocol shape is understood.
 */
import type { Artist } from '@/domain/entities/Artist';
import type { Provenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { CoverSource } from '@/domain/entities/Cover';
import type { PlexMetadata } from './types';
import { mbidOf } from './externalIds';

export function mapArtist(dto: PlexMetadata, provenance: Provenance): Artist {
  const nativeId = dto.ratingKey == null ? '' : String(dto.ratingKey);
  const cover: CoverSource = dto.thumb ? { kind: 'plex', path: dto.thumb } : { kind: 'none' };
  const mbid = mbidOf(dto);

  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: mbid ? { mbid } : {},
    // Anything the user's own server returned is, by definition, in their library.
    libraryState: 'in-library',
    name: dto.title ?? 'Unknown Artist',
    cover,
    biography: dto.summary,
    tags: [],
    albumIds: [],
  };
}
