/**
 * The artist and album references embedded in MusicBrainz release-group and
 * track payloads.
 *
 * MusicBrainz names a neighbour through an "artist credit" — a list, because
 * a work can be credited to several artists, but this app only surfaces the
 * primary one, same as it does for every other provider. An album reference
 * is built straight from the release-group DTO it was resolved from, since
 * that is the only shape a MusicBrainz release-group ever names itself with.
 */
import type { AlbumRef, ArtistRef } from '@/domain/entities/EntityRef';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { CoverSource } from '@/domain/entities/Cover';
import type { MbReleaseGroup } from './';

/** The `artist-credit` entry shape MusicBrainz embeds on releases and tracks. */
type MbArtistCredit = { name?: string; artist: { id?: string; name: string } };

export function artistRef(provenance: Provenance, credits: MbArtistCredit[] | undefined): ArtistRef {
  const credit = credits?.[0];
  const nativeId = credit?.artist.id ?? '';
  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    externalIds: nativeId ? { mbid: nativeId } : {},
    name: credit?.name ?? credit?.artist.name ?? 'Unknown Artist',
    // MusicBrainz's search/lookup responses used here carry no artist image.
    cover: { kind: 'none' },
  };
}

export function albumRef(provenance: Provenance, releaseGroup: MbReleaseGroup): AlbumRef {
  const nativeId = releaseGroup.id ?? '';
  const cover: CoverSource = nativeId
    ? { kind: 'coverartarchive', mbid: nativeId, mbidType: 'release-group' }
    : { kind: 'none' };
  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    externalIds: nativeId ? { mbid: nativeId, mbidType: 'release-group' } : {},
    title: releaseGroup.title ?? 'Unknown Album',
    cover,
  };
}
