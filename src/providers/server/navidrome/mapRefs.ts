/**
 * The artist and album references embedded in Subsonic song and album payloads.
 *
 * Subsonic returns a neighbour as a name plus an id, never as a full record, so
 * these build the reference form directly rather than mapping a partial entity
 * and casting the result — which is what the removed partial-track casts were
 * doing.
 */
import type { AlbumRef, ArtistRef } from '@/domain/entities/EntityRef';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import { artistCoverSubject, missingCover, type CoverSource } from '@/domain/entities/Cover';

export function artistRef(
  provenance: Provenance,
  nativeId: string | undefined,
  name: string | undefined,
  cover: CoverSource = missingCover(artistCoverSubject(name))
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
