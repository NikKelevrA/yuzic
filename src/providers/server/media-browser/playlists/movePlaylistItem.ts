import type { MediaBrowserClient } from "../client";

/** Moves one entry to `newIndex`, counted in the playlist as it will read after the move. */
export async function movePlaylistItem(
  client: MediaBrowserClient,
  playlistId: string,
  entryId: string,
  newIndex: number
): Promise<void> {
  await client.request(
    `/Playlists/${playlistId}/Items/${encodeURIComponent(entryId)}/Move/${newIndex}`,
    { method: "POST" }
  );
}
