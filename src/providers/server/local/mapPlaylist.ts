/**
 * Local playlist record -> domain Playlist.
 *
 * `LocalPlaylist` (`./store.ts`) is the raw shape here, playing the role a
 * server's playlist DTO plays elsewhere — it is the record actually
 * persisted on-device by `addLocalPlaylist`/`updateLocalPlaylist`.
 */
import type { Playlist } from '@/domain/entities/Playlist';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { LocalPlaylist } from './store';

interface MapPlaylistContext {
  provenance: Provenance;
  /** Ids of the playlist's tracks, in playlist order, where they were mapped. */
  songIds?: LocalId[];
}

export function mapPlaylist(dto: LocalPlaylist, context: MapPlaylistContext): Playlist {
  const { provenance } = context;
  const nativeId = dto.id;

  return {
    localId: makeLocalId('playlist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    // A playlist the user created on-device is, by definition, in their library.
    libraryState: 'in-library',
    title: dto.title,
    // Local playlists carry no artwork of their own.
    cover: { kind: 'none' },
    // Every local playlist is created by the user on this device.
    isOwned: true,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    songIds: context.songIds ?? [],
  };
}
