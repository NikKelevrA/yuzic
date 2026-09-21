/**
 * MediaBrowser (Jellyfin/Emby) album DTO -> domain Album.
 *
 * Both brands describe an album with the same `MediaBrowserItem` shape (the
 * `/Items?IncludeItemTypes=MusicAlbum` and `/Artists`-adjacent endpoints
 * agree), so unlike Navidrome's two Subsonic shapes there is only one input
 * type here.
 */
import type { Album, ReleaseType } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import { albumCoverSubject, artistCoverSubject, coverOrMissing } from '@/domain/entities/Cover';
import { buildCoverWithTag, itemCover, type MediaBrowserBrand } from './brand';
import { artistRef } from './mapRefs';
import type { MediaBrowserItem } from './types';

function externalIdsOf(dto: MediaBrowserItem): ExternalIds {
  const ids = dto.ProviderIds;
  if (!ids) return {};
  // Prefer the release-group id where it is reported — it is the id Cover Art
  // Archive and matching expect for an album; MusicBrainzAlbum is a specific
  // release and only used as a fallback when no group id is available.
  if (ids.MusicBrainzReleaseGroup) return { mbid: ids.MusicBrainzReleaseGroup, mbidType: 'release-group' };
  if (ids.MusicBrainzAlbum) return { mbid: ids.MusicBrainzAlbum, mbidType: 'release' };
  return {};
}

interface MapAlbumContext {
  provenance: Provenance;
  brand: MediaBrowserBrand;
  /**
   * Ids of the album's tracks, in running order, where they have been mapped.
   * Passed in rather than derived here so that mapping an album never implies
   * mapping its songs.
   */
  songIds?: LocalId[];
}

export function mapAlbum(dto: MediaBrowserItem, context: MapAlbumContext): Album {
  const { provenance, brand } = context;
  const nativeId = dto.Id ?? '';
  const artistItem = dto.ArtistItems?.[0];
  const artistName = artistItem?.Name ?? dto.AlbumArtist;
  const externalIds = externalIdsOf(dto);
  const cover = itemCover(brand, dto, albumCoverSubject(dto.Name, artistName, externalIds));

  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    provenance,
    externalIds,
    title: dto.Name ?? 'Unknown Album',
    cover,
    // The embedded artist gets a cover derived from the album payload itself —
    // Jellyfin resolves artist art from the item id alone, so no second fetch
    // is needed, while Emby needs an image tag this endpoint does not return
    // and correctly ends up with none. Dropping this made the Playing screen's
    // "About the artist" card fall back to a `{ kind: 'none' }` cover, which is
    // not nullish and so did not fall through to the song's cover at all.
    artist: artistRef(
      provenance,
      artistItem?.Id,
      artistName,
      coverOrMissing(buildCoverWithTag(brand, artistItem?.Id, undefined), artistCoverSubject(artistName))
    ),
    year: dto.ProductionYear,
    releaseDate: dto.PremiereDate,
    // Neither brand's item schema carries a release-type field; everything in
    // a library listing is presented as an album unless a provider that knows
    // better says otherwise.
    releaseType: 'album' satisfies ReleaseType,
    genres: (dto.Genres ?? []).flatMap(genre => genre.split(/[,;]/)).map(genre => genre.trim()).filter(Boolean),
    addedAt: dto.DateCreated ? Date.parse(dto.DateCreated) || undefined : undefined,
    serverPlayCount: dto.UserData?.PlayCount,
    serverLastPlayedAt: dto.UserData?.LastPlayedDate
      ? Date.parse(dto.UserData.LastPlayedDate) || undefined
      : undefined,
    songIds: context.songIds ?? [],
  };
}
