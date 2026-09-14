/**
 * Plex playlist DTO -> domain Playlist.
 *
 * Playlists get the same identity and provenance contract as every other
 * entity. They previously had neither, which is why a server playlist and a
 * generated one were indistinguishable once both were on screen.
 */
import type { Playlist } from '@/domain/entities/Playlist';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { CoverSource } from '@/domain/entities/Cover';
import type { PlexMetadata } from './types';

const id = (value: string | number | undefined): string => (value == null ? '' : String(value));

export interface MapPlaylistContext {
  provenance: Provenance;
  /** Ids of the playlist's tracks, in playlist order, where they were mapped. */
  songIds?: LocalId[];
}

export function mapPlaylist(dto: PlexMetadata, context: MapPlaylistContext): Playlist {
  const { provenance } = context;
  const nativeId = id(dto.ratingKey);
  const cover: CoverSource = dto.thumb ? { kind: 'plex', path: dto.thumb } : { kind: 'none' };

  return {
    localId: makeLocalId('playlist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: dto.title ?? 'Untitled playlist',
    cover,
    // Plex's `/playlists` listing does not distinguish owned from shared, and
    // only returns playlists visible to the authenticated account.
    isOwned: true,
    createdAt: dto.addedAt ? dto.addedAt * 1000 : undefined,
    updatedAt: dto.updatedAt ? dto.updatedAt * 1000 : dto.addedAt ? dto.addedAt * 1000 : undefined,
    songIds: context.songIds ?? [],
  };
}
