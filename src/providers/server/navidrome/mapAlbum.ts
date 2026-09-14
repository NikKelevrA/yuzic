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
   * The artist's own cover, where the caller already has it.
   *
   * Subsonic's album payload names the artist but carries no artwork for
   * them, and `{ kind: 'none' }` is not nullish — a consumer written as
   * `album.artist.cover ?? song.cover` does not fall through it, so an
   * unresolved ref renders as a broken image rather than a fallback. The one
   * caller that fetches the artist anyway passes it here.
   */
  artistCover?: CoverSource;
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
    artist: artistRef(provenance, dto.artistId, dto.artist, context.artistCover),
    year: dto.year,
    // Subsonic has no release-type field; everything in a library listing is
    // presented as an album unless a provider that knows better says otherwise.
    releaseType: 'album' satisfies ReleaseType,
    genres: dto.genre ? [dto.genre] : [],
    addedAt: dto.created ? Date.parse(dto.created) || undefined : undefined,
    // Only the getAlbumList shape reports these; the ID3 album object does not.
    serverPlayCount: 'playCount' in dto ? dto.playCount : undefined,
    serverLastPlayedAt: 'played' in dto && dto.played
      ? Date.parse(dto.played) || undefined
      : undefined,
    songIds: context.songIds ?? [],
  };
}
