/**
 * Deezer album DTO -> domain Album.
 */
import type { Album, ReleaseType } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { Provenance } from '@/domain/identity/Provenance';
import { albumCoverSubject } from '@/domain/entities/Cover';
import { imageCover } from './imageCover';
import { artistRef } from './mapRefs';
import type { DeezerAlbum } from './types';

function externalIdsOf(dto: DeezerAlbum): ExternalIds {
  const ids: ExternalIds = {};
  if (dto.id != null) ids.deezerId = String(dto.id);
  if (dto.upc) ids.upc = dto.upc;
  return ids;
}

/** Deezer's `record_type`: `'album' | 'single' | 'ep' | 'compile' | ...`. */
function releaseTypeOf(recordType: string | null | undefined): ReleaseType {
  if (recordType === 'single') return 'single';
  if (recordType === 'ep') return 'ep';
  // Deezer's own docs and payloads use 'compile' for this; 'compilation' is
  // tolerated too in case that ever changes underneath us.
  if (recordType === 'compile' || recordType === 'compilation') return 'compilation';
  return 'album';
}

/** Deezer reports `release_date` as `YYYY-MM-DD`; the year is its first 4 digits. */
function yearOf(releaseDate: string | null | undefined): number | undefined {
  if (!releaseDate) return undefined;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : undefined;
}

interface MapAlbumContext {
  provenance: Provenance;
  /**
   * Ids of the album's tracks, in running order, where they have been mapped.
   * Passed in rather than derived here so that mapping an album never implies
   * mapping its songs — same contract as the Navidrome reference.
   */
  songIds?: LocalId[];
}

export function mapAlbum(dto: DeezerAlbum, context: MapAlbumContext): Album {
  const { provenance } = context;
  const nativeId = dto.id != null ? String(dto.id) : '';

  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: externalIdsOf(dto),
    // Browsing Deezer's catalogue is not owning it — see LibraryState and
    // mapArtist's comment on why this mapper never guesses further than that.
    title: dto.title ?? 'Unknown Album',
    cover: imageCover(
      [dto.cover_xl, dto.cover_big, dto.cover_medium],
      albumCoverSubject(dto.title, dto.artist?.name, externalIdsOf(dto))
    ),
    artist: artistRef(provenance, dto.artist),
    year: yearOf(dto.release_date),
    releaseDate: dto.release_date ?? undefined,
    releaseType: releaseTypeOf(dto.record_type),
    // Deezer's album object carries no genre list of its own; genres live
    // behind the separate /genre endpoint, keyed by id, not attached here.
    genres: [],
    // `addedAt` is for server-originated records only — this album was never
    // "added" to anything, it's being browsed.
    songIds: context.songIds ?? [],
  };
}
