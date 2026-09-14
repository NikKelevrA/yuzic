/**
 * The artist and album references embedded in Plex track/album metadata.
 *
 * Plex returns a neighbour as a name plus a `ratingKey`, never as a full
 * record (`grandparentRatingKey`/`grandparentTitle` for a track's artist,
 * `parentRatingKey`/`parentTitle` for its album), so these build the
 * reference form directly rather than mapping a partial entity and casting
 * the result.
 */
import type { AlbumRef, ArtistRef } from '@/domain/entities/EntityRef';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { CoverSource } from '@/domain/entities/Cover';

export function artistRef(
  provenance: Provenance,
  nativeId: string | undefined,
  name: string | undefined,
  cover: CoverSource = { kind: 'none' }
): ArtistRef {
  const id = nativeId ?? '';
  return {
    localId: makeLocalId('artist', provenance, id),
    nativeId: id,
    externalIds: {},
    name: name ?? 'Unknown Artist',
    cover,
  };
}

export function albumRef(
  provenance: Provenance,
  nativeId: string | undefined,
  title: string | undefined,
  cover: CoverSource = { kind: 'none' }
): AlbumRef {
  const id = nativeId ?? '';
  return {
    localId: makeLocalId('album', provenance, id),
    nativeId: id,
    externalIds: {},
    title: title ?? 'Unknown Album',
    cover,
  };
}
