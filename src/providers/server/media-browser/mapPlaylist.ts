/**
 * MediaBrowser (Jellyfin/Emby) playlist DTO -> domain Playlist.
 *
 * Playlists get the same identity and provenance contract as every other
 * entity. They previously had neither, which is why a server playlist and a
 * generated one were indistinguishable once both were on screen.
 */
import type { Playlist } from '@/domain/entities/Playlist';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import { buildCover, type MediaBrowserBrand } from './brand';
import type { MediaBrowserItem } from './types';

interface MapPlaylistContext {
  provenance: Provenance;
  brand: MediaBrowserBrand;
  /** Ids of the playlist's tracks, in playlist order, where they were mapped. */
  songIds?: LocalId[];
}

export function mapPlaylist(dto: MediaBrowserItem, context: MapPlaylistContext): Playlist {
  const { provenance, brand } = context;
  const nativeId = dto.Id ?? '';
  const cover = buildCover(brand, dto.Id);

  return {
    localId: makeLocalId('playlist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: dto.Name ?? 'Untitled playlist',
    cover,
    // The `/Items?IncludeItemTypes=Playlist` listing does not say who owns a
    // playlist, and both brands only return playlists visible to the caller.
    isOwned: true,
    createdAt: dto.DateCreated ? Date.parse(dto.DateCreated) || undefined : undefined,
    updatedAt: dto.DateLastMediaAdded ? Date.parse(dto.DateLastMediaAdded) || undefined : undefined,
    songIds: context.songIds ?? [],
  };
}
