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
import { buildCoverWithTag, type MediaBrowserBrand } from './brand';
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

export interface MapAlbumContext {
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
  const cover = buildCoverWithTag(brand, dto.Id, dto.ImageTags?.Primary);
  const artistItem = dto.ArtistItems?.[0];

  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: externalIdsOf(dto),
    libraryState: 'in-library',
    title: dto.Name ?? 'Unknown Album',
    cover,
    artist: artistRef(provenance, artistItem?.Id, artistItem?.Name ?? dto.AlbumArtist),
    year: dto.ProductionYear,
    releaseDate: dto.PremiereDate,
    // Neither brand's item schema carries a release-type field; everything in
    // a library listing is presented as an album unless a provider that knows
    // better says otherwise.
    releaseType: 'album' satisfies ReleaseType,
    genres: (dto.Genres ?? []).flatMap(genre => genre.split(/[,;]/)).map(genre => genre.trim()).filter(Boolean),
    addedAt: dto.DateCreated ? Date.parse(dto.DateCreated) || undefined : undefined,
    songIds: context.songIds ?? [],
  };
}
