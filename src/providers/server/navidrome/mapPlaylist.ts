/**
 * Subsonic playlist DTO -> domain Playlist.
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
import type { SubsonicPlaylist } from './types';

export interface MapPlaylistContext {
  provenance: Provenance;
  /** Ids of the playlist's tracks, in playlist order, where they were mapped. */
  songIds?: LocalId[];
}

export function mapPlaylist(dto: SubsonicPlaylist, context: MapPlaylistContext): Playlist {
  const { provenance } = context;
  const nativeId = dto.id ?? '';
  const cover: CoverSource = dto.coverArt
    ? { kind: 'navidrome', coverArtId: dto.coverArt }
    : { kind: 'none' };

  return {
    localId: makeLocalId('playlist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: dto.name ?? 'Untitled playlist',
    cover,
    // Subsonic's playlist listing does not distinguish owned from shared, and
    // Navidrome only returns the caller's own playlists plus public ones.
    isOwned: true,
    createdAt: dto.created ? Date.parse(dto.created) || undefined : undefined,
    updatedAt: dto.changed ? Date.parse(dto.changed) || undefined : undefined,
    songIds: context.songIds ?? [],
  };
}
