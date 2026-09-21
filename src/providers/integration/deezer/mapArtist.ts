/**
 * Deezer artist DTO -> domain Artist.
 *
 * Mapping is the boundary: a `DeezerArtist` exists on this side of it and
 * never beyond. Provenance is passed in rather than constructed here, because
 * the mapper must be callable from a fixture test with no client at all —
 * that is what makes this the one place Deezer's artist shape is understood.
 */
import type { Artist } from '@/domain/entities/Artist';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import { artistCoverSubject } from '@/domain/entities/Cover';
import { imageCover } from './imageCover';
import type { DeezerArtist } from './types';

export function mapArtist(dto: DeezerArtist, provenance: Provenance): Artist {
  const nativeId = dto.id != null ? String(dto.id) : '';

  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: nativeId ? { deezerId: nativeId } : {},
    // An artist known only through Deezer is one the user is browsing, not
    // one they own. Whether it becomes wanted/acquirable is decided later by
    // a policy that knows the user's wants and connected downloaders — this
    // mapper has neither, and must not guess. See LibraryState.
    name: dto.name ?? 'Unknown Artist',
    cover: imageCover([dto.picture_xl, dto.picture_big, dto.picture_medium], artistCoverSubject(dto.name)),
    // Deezer's public artist object has no biography, and no tag/genre list.
    tags: [],
    albumIds: [],
  };
}
