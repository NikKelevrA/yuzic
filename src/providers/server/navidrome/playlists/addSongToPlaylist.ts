import type { NavidromeClient } from "../client";
import { SubsonicResponse } from "../types";
import type { AddSongToPlaylistResult } from "@/providers/contracts/ServerAdapter";

export async function addSongToPlaylist(
  client: NavidromeClient,
  playlistId: string,
  songId: string
): Promise<AddSongToPlaylistResult> {
  const raw = await client.request<SubsonicResponse>(
    "updatePlaylist.view",
    { playlistId, songIdToAdd: songId },
    { method: "POST" }
  );
  const status = raw?.["subsonic-response"]?.status;
  return { success: status === "ok" };
}