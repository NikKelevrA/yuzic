/**
 * MusicBrainz release-group DTO -> domain Album.
 *
 * This adapter never fetches a MusicBrainz *release* on its own — every
 * lookup (`searchReleaseGroup`, `getReleaseGroup`, ...) works in
 * release-group terms, and `getTracksForReleaseGroup` only reaches into a
 * concrete release internally to read its tracks back out. So the id this
 * mapper records is always a release-group id, and `mbidType` is always
 * `'release-group'` — never `'release'` — which matters because Cover Art
 * Archive indexes releases and release-groups under different paths.
 */
import type { Album, ReleaseType } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { CoverSource } from '@/domain/entities/Cover';
import { artistRef } from './mapRefs';
import type { MbReleaseGroup } from './';

/**
 * MusicBrainz's `primary-type`/`secondary-types` vocabulary maps onto the
 * domain's four release types. A compilation is flagged as a secondary type
 * layered on top of whatever primary type it has, so it is checked first.
 */
function releaseTypeOf(dto: MbReleaseGroup): ReleaseType {
  if (dto['secondary-types']?.includes('Compilation')) return 'compilation';
  if (dto['primary-type'] === 'Single') return 'single';
  if (dto['primary-type'] === 'EP') return 'ep';
  return 'album';
}

/** MusicBrainz reports `first-release-date` as `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
function yearOf(firstReleaseDate: string | undefined): number | undefined {
  if (!firstReleaseDate) return undefined;
  const year = Number(firstReleaseDate.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : undefined;
}

interface MapAlbumContext {
  provenance: Provenance;
  /**
   * Ids of the album's tracks, in running order, where they have been mapped.
   * Passed in rather than derived here, same contract as the Navidrome and
   * Deezer mappers — mapping an album never implies mapping its songs.
   */
  songIds?: LocalId[];
}

export function mapAlbum(dto: MbReleaseGroup, context: MapAlbumContext): Album {
  const { provenance } = context;
  const nativeId = dto.id ?? '';
  const cover: CoverSource = nativeId
    ? { kind: 'coverartarchive', mbid: nativeId, mbidType: 'release-group' }
    : { kind: 'none' };
  const firstReleaseDate = dto['first-release-date'];

  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: nativeId ? { mbid: nativeId, mbidType: 'release-group' } : {},
    // Browsing MusicBrainz's catalogue is not owning it — see mapArtist's
    // comment on why this mapper never guesses further than 'external'.
    title: dto.title ?? 'Unknown Album',
    cover,
    artist: artistRef(provenance, dto['artist-credit']),
    year: yearOf(firstReleaseDate),
    // Only carried when it is finer than the year already captured above —
    // a bare 'YYYY' first-release-date says nothing releaseDate wouldn't.
    releaseDate: firstReleaseDate && firstReleaseDate.length > 4 ? firstReleaseDate : undefined,
    releaseType: releaseTypeOf(dto),
    // This adapter never requests genre/tag data for a release-group.
    genres: [],
    songIds: context.songIds ?? [],
  };
}
