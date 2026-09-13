/**
 * The single place that turns "which playlist" into one canonical
 * `PlaylistDetail`.
 *
 * Same reasoning as `songRepository.ts`: no `catalogue.playlist` capability
 * exists, so the only origin is the active server, one call, and the
 * matching adapter is built locally on `findMatch` rather than extending
 * `matchToLibrary.ts` (out of this feature's file scope). A playlist has
 * nothing to pair a title with — same as an artist's name — so the fallback
 * matches on normalized title alone.
 */
import { findMatch } from '@/domain/identity/matching';
import type { Playlist } from '@/domain/entities/Playlist';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import type { PlaylistsApi } from '@/api/types';

export type PlaylistIdentity = {
  kind: 'server';
  /** The playlist's id at the active server — `PlaylistsApi.get`'s `id`. */
  nativeId: string;
};

export interface PlaylistRepositoryDeps {
  api: Pick<PlaylistsApi, 'get'>;
  libraryPlaylists: readonly Playlist[];
}

function matchPlaylistToLibrary(subject: Playlist, playlists: readonly Playlist[]): Playlist | null {
  const match = findMatch(
    { externalIds: subject.externalIds, nameKey: { primary: subject.title } },
    playlists,
    playlist => ({ primary: playlist.title })
  );
  return match?.candidate ?? null;
}

/**
 * Fetches one playlist from its single origin and relates it to the library.
 *
 * Mirrors `albumRepository.getAlbum`: the library record wins as the entity
 * when the fetched playlist matches one already loaded, keeping the
 * freshly-fetched track list either way.
 */
export async function getPlaylist(
  identity: PlaylistIdentity,
  deps: PlaylistRepositoryDeps
): Promise<PlaylistDetail> {
  const detail = await deps.api.get(identity.nativeId);
  const matched = matchPlaylistToLibrary(detail.playlist, deps.libraryPlaylists);
  return matched ? { playlist: matched, songs: detail.songs } : detail;
}
