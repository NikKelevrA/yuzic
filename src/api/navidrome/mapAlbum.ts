/**
 * Subsonic album DTO -> domain Album.
 *
 * Two shapes arrive from Subsonic: the ID3 `album` object (titled `name`, may
 * carry its song list) and the `getAlbumList` entry (titled `title`, never
 * carries songs). Both map here, because a caller should not have to know
 * which endpoint an album came from to render it.
 */
import type { Album, ReleaseType } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { CoverSource } from '@/types/Cover';
import { artistRef } from './mapRefs';
import type { SubsonicAlbum, SubsonicAlbumListEntry } from './types';

type AnyAlbumDto = SubsonicAlbum | SubsonicAlbumListEntry;

const titleOf = (dto: AnyAlbumDto): string =>
  ('name' in dto ? dto.name : undefined) ?? ('title' in dto ? dto.title : undefined) ?? 'Unknown Album';

export interface MapAlbumContext {
  provenance: Provenance;
  /**
   * Ids of the album's tracks, in running order, where they have been mapped.
   * Passed in rather than derived here so that mapping an album never implies
   * mapping its songs.
   */
  songIds?: LocalId[];
}

export function mapAlbum(dto: AnyAlbumDto, context: MapAlbumContext): Album {
  const { provenance } = context;
  const nativeId = dto.id ?? '';
  const cover: CoverSource = dto.coverArt
    ? { kind: 'navidrome', coverArtId: dto.coverArt }
    : { kind: 'none' };

  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    provenance,
    // Navidrome's album MBID is a release-group id where it reports one.
    externalIds: 'musicBrainzId' in dto && dto.musicBrainzId
      ? { mbid: dto.musicBrainzId, mbidType: 'release-group' }
      : {},
    libraryState: 'in-library',
    title: titleOf(dto),
    cover,
    artist: artistRef(provenance, dto.artistId, dto.artist),
    year: dto.year,
    // Subsonic has no release-type field; everything in a library listing is
    // presented as an album unless a provider that knows better says otherwise.
    releaseType: 'album' satisfies ReleaseType,
    genres: dto.genre ? [dto.genre] : [],
    addedAt: dto.created ? Date.parse(dto.created) || undefined : undefined,
    songIds: context.songIds ?? [],
  };
}
