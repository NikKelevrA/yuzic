/**
 * Plex album DTO -> domain Album.
 */
import type { Album, ReleaseType } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import { albumCoverSubject, artistCoverSubject, missingCover, type CoverSource } from '@/domain/entities/Cover';
import { artistRef } from './mapRefs';
import { mbidOf } from './externalIds';
import type { PlexMetadata } from './types';

const id = (value: string | number | undefined): string => (value == null ? '' : String(value));

function externalIdsOf(dto: PlexMetadata): ExternalIds {
  const mbid = mbidOf(dto);
  // Plex's album Guid, where present, is a release id rather than a
  // release-group id — there is no group-level equivalent in its schema.
  return mbid ? { mbid, mbidType: 'release' } : {};
}

interface MapAlbumContext {
  provenance: Provenance;
  /**
   * Ids of the album's tracks, in running order, where they have been mapped.
   * Passed in rather than derived here so that mapping an album never implies
   * mapping its songs.
   */
  songIds?: LocalId[];
}

export function mapAlbum(dto: PlexMetadata, context: MapAlbumContext): Album {
  const { provenance } = context;
  const nativeId = id(dto.ratingKey);
  const externalIds = externalIdsOf(dto);
  const cover: CoverSource = dto.thumb
    ? { kind: 'plex', path: dto.thumb }
    : missingCover(albumCoverSubject(dto.title, dto.parentTitle, externalIds));
  const artistCover: CoverSource = dto.parentThumb
    ? { kind: 'plex', path: dto.parentThumb }
    : missingCover(artistCoverSubject(dto.parentTitle));

  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    provenance,
    externalIds,
    libraryState: 'in-library',
    title: dto.title ?? 'Unknown Album',
    cover,
    artist: artistRef(provenance, id(dto.parentRatingKey), dto.parentTitle, artistCover),
    year: dto.year,
    // Plex has no separate release-type field; everything in a library
    // listing is presented as an album unless a provider that knows better
    // says otherwise.
    releaseType: 'album' satisfies ReleaseType,
    genres: (dto.Genre ?? []).flatMap(genre => genre.tag?.split(';') ?? []).map(genre => genre.trim()).filter(Boolean),
    addedAt: dto.addedAt ? dto.addedAt * 1000 : undefined,
    serverPlayCount: dto.viewCount,
    // Plex reports this in unix seconds; the domain stores unix ms.
    serverLastPlayedAt: dto.lastViewedAt ? dto.lastViewedAt * 1000 : undefined,
    songIds: context.songIds ?? [],
  };
}
