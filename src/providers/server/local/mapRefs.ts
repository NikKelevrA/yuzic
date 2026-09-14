/**
 * The artist and album references embedded in a local track record.
 *
 * A `LocalTrack` carries its artist/album as a flat id-plus-name pair, never
 * as a full record (there is no separate on-device artist/album table — see
 * `mapArtist.ts`/`mapAlbum.ts`), so these build the reference form directly
 * rather than mapping a partial entity and casting the result.
 */
import type { AlbumRef, ArtistRef } from '@/domain/entities/EntityRef';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { CoverSource } from '@/types/Cover';

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
