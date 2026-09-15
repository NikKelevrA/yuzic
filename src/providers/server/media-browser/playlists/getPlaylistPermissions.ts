import type { MediaBrowserClient } from "../client";
import { MediaBrowserRequestError } from "../requestError";

type PlaylistDto = { Shares?: { UserId?: string; CanEdit?: boolean }[] };
type PlaylistUserPermissions = { CanEdit?: boolean };

type PlaylistPermissions = { isOwned: boolean; canEdit: boolean };

/** Jellyfin writes user ids with dashes in some places and without in others. */
const sameId = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();

/**
 * Who may change a Jellyfin playlist: its owner, or an account it was shared
 * with edit rights (Jellyfin 10.9 and later).
 *
 * The item listing says neither, so every playlist used to read as the
 * caller's own — another account's public playlist offered Rename, Delete and
 * Edit songs, and the server refused each. `GET /Playlists/{id}/Users/{me}`
 * answers for the owner and for shares; a 404 or 403 there means the caller
 * is neither.
 *
 * Null where the server cannot say — Emby, a Jellyfin that predates shared
 * playlists, or a failed lookup — and the playlist keeps its default of
 * being the caller's own. Permissions only decide what is offered; the server
 * still refuses what it should, so a lookup failure is no reason to fail the
 * playlist itself.
 */
export async function getPlaylistPermissions(
  client: MediaBrowserClient,
  playlistId: string
): Promise<PlaylistPermissions | null> {
  if (client.brand.kind !== "jellyfin") return null;
  const id = encodeURIComponent(playlistId);

  let playlist: PlaylistDto;
  try {
    playlist = await client.request<PlaylistDto>(`/Playlists/${id}`);
  } catch {
    return null;
  }
  const sharedWithMe = (playlist.Shares ?? []).some(share => sameId(share.UserId, client.userId));

  try {
    const mine = await client.request<PlaylistUserPermissions>(
      `/Playlists/${id}/Users/${encodeURIComponent(client.userId)}`
    );
    const canEdit = mine.CanEdit === true;
    return { isOwned: canEdit && !sharedWithMe, canEdit };
  } catch (error) {
    if (error instanceof MediaBrowserRequestError && (error.status === 404 || error.status === 403)) {
      return { isOwned: false, canEdit: false };
    }
    return null;
  }
}
