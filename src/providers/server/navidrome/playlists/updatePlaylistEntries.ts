import type { NavidromeClient } from "../client";
import { entryIndex, movedOrder } from "@/providers/server/playlistEntries";
import type { PlaylistMove } from "@/providers/contracts/ServerAdapter";
import { getPlaylist } from "./getPlaylist";
import type { Provenance } from "@/domain/identity/Provenance";

/**
 * One `updatePlaylist` call: entries removed by index, then songs appended.
 * The server applies both in that order in one transaction, and the client
 * rejects a refusal, so there is no status to read here.
 */
export async function updatePlaylistEntries(
  client: NavidromeClient,
  playlistId: string,
  edit: { removeIndexes?: number[]; add?: string[] }
): Promise<void> {
  await client.request(
    "updatePlaylist.view",
    {
      playlistId,
      ...(edit.removeIndexes?.length ? { songIndexToRemove: edit.removeIndexes } : {}),
      ...(edit.add?.length ? { songIdToAdd: edit.add } : {}),
    },
    { method: "POST" }
  );
}

async function playlistSongIds(client: NavidromeClient, playlistId: string, provenance: Provenance) {
  const detail = await getPlaylist(client, playlistId, provenance);
  if (!detail) throw new Error("Playlist not found");
  return detail.songs.map((song) => song.nativeId);
}

export async function removePlaylistEntry(
  client: NavidromeClient,
  provenance: Provenance,
  playlistId: string,
  songId: string,
  position?: number
): Promise<void> {
  const ids = await playlistSongIds(client, playlistId, provenance);
  await updatePlaylistEntries(client, playlistId, { removeIndexes: [entryIndex(ids, songId, position)] });
}

/**
 * Subsonic can only append, so a move takes the entries from the first
 * position that changes to the end off the playlist and appends them back in
 * the new order. Only that tail is sent — a move near the bottom of a long
 * playlist stays a short request.
 */
export async function movePlaylistEntry(
  client: NavidromeClient,
  provenance: Provenance,
  playlistId: string,
  move: PlaylistMove
): Promise<void> {
  const ids = await playlistSongIds(client, playlistId, provenance);
  const from = entryIndex(ids, move.songId, move.from);
  const reordered = movedOrder(ids, from, move.to);
  const start = reordered.findIndex((id, i) => id !== ids[i]);
  if (start === -1) return;
  await updatePlaylistEntries(client, playlistId, {
    removeIndexes: ids.slice(start).map((_, i) => start + i),
    add: reordered.slice(start),
  });
}
