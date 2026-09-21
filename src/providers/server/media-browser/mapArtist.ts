/**
 * MediaBrowser (Jellyfin/Emby) artist DTO -> domain Artist.
 *
 * Mapping is the boundary: a `MediaBrowserItem` exists on this side of it and
 * never beyond. Provenance and brand are passed in rather than read from a
 * client, because the mapper must be callable from a fixture test with no
 * client at all — that is what makes these the one place a protocol shape is
 * understood.
 */
import type { Artist } from '@/domain/entities/Artist';
import type { Provenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';
import { artistCoverSubject } from '@/domain/entities/Cover';
import { itemCover, type MediaBrowserBrand } from './brand';
import { normalizeGenres } from './utils/normalizeGenres';
import type { MediaBrowserItem } from './types';

interface MapArtistContext {
  provenance: Provenance;
  /** Jellyfin and Emby address artist art differently — see `brand.ts`. */
  brand: MediaBrowserBrand;
}

export function mapArtist(dto: MediaBrowserItem, context: MapArtistContext): Artist {
  const { provenance, brand } = context;
  const nativeId = dto.Id ?? '';
  const externalIds = dto.ProviderIds?.MusicBrainz ? { mbid: dto.ProviderIds.MusicBrainz } : {};
  const cover = itemCover(brand, dto, artistCoverSubject(dto.Name, externalIds));

  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds,
    // Anything the user's own server returned is, by definition, in their library.
    name: dto.Name ?? 'Unknown Artist',
    cover,
    biography: dto.Overview,
    // The server's own genres for the artist are its tags, ahead of any backup's.
    tags: normalizeGenres(dto.Genres) ?? [],
    albumIds: [],
  };
}
