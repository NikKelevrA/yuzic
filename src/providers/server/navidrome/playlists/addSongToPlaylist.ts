import type { NavidromeClient } from "../client";
import { updatePlaylistEntries } from "./updatePlaylistEntries";

export async function addSongToPlaylist(
  client: NavidromeClient,
  playlistId: string,
  songId: string
): Promise<void> {
  await updatePlaylistEntries(client, playlistId, { add: [songId] });
}
