/**
 * Subsonic artist DTO -> domain Artist.
 *
 * Mapping is the boundary: a `SubsonicArtist` exists on this side of it and
 * never beyond. Provenance is passed in rather than read from a client,
 * because the mapper must be callable from a fixture test with no client at
 * all — that is what makes these the one place a protocol shape is understood.
 */
import type { Artist } from '@/domain/entities/Artist';
import type { Provenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { CoverSource } from '@/domain/entities/Cover';
import type { SubsonicArtist } from './types';

export function mapArtist(dto: SubsonicArtist, provenance: Provenance): Artist {
  const nativeId = dto.id ?? '';
  const cover: CoverSource = dto.coverArt
    ? { kind: 'navidrome', coverArtId: dto.coverArt }
    : { kind: 'none' };

  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    provenance,
    // Navidrome reports an artist MBID on the ID3 endpoints; absent elsewhere.
    externalIds: dto.musicBrainzId ? { mbid: dto.musicBrainzId } : {},
    // Anything the user's own server returned is, by definition, in their library.
    libraryState: 'in-library',
    name: dto.name ?? 'Unknown Artist',
    cover,
    tags: [],
    albumIds: [],
  };
}
