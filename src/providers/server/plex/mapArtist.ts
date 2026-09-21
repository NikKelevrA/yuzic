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
import { artistCoverSubject, missingCover, type CoverSource } from '@/domain/entities/Cover';
import type { PlexMetadata } from './types';
import { mbidOf } from './externalIds';

export function mapArtist(dto: PlexMetadata, provenance: Provenance): Artist {
  const nativeId = dto.ratingKey == null ? '' : String(dto.ratingKey);
  const mbid = mbidOf(dto);
  const externalIds = mbid ? { mbid } : {};
  const cover: CoverSource = dto.thumb
    ? { kind: 'plex', path: dto.thumb }
    : missingCover(artistCoverSubject(dto.title, externalIds));

  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds,
    // Anything the user's own server returned is, by definition, in their library.
    name: dto.title ?? 'Unknown Artist',
    cover,
    biography: dto.summary,
    // The server's own genres for the artist are its tags, ahead of any backup's.
    tags: (dto.Genre ?? []).flatMap(genre => genre.tag?.split(';') ?? []).map(genre => genre.trim()).filter(Boolean),
    albumIds: [],
  };
}
