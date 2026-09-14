import type { NavidromeClient } from "../client";
import { SubsonicResponse } from "../types";
import type { RemoveSongFromPlaylistResult } from "@/providers/contracts/ServerAdapter";

export async function removeSongFromPlaylist(
  client: NavidromeClient,
  playlistId: string,
  songIndex: string
): Promise<RemoveSongFromPlaylistResult> {
  const raw = await client.request<SubsonicResponse>(
    "updatePlaylist.view",
    { playlistId, songIndexToRemove: songIndex },
    { method: "POST" }
  );
  const status = raw?.["subsonic-response"]?.status;
  return { success: status === "ok" };
}