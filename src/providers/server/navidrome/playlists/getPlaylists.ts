import type { Playlist } from "@/domain/entities/Playlist";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapPlaylist } from "../mapPlaylist";
import { SubsonicResponse } from "../types";

export type GetPlaylistsResult = Playlist[];

export async function getPlaylists(
  client: NavidromeClient,
  provenance: Provenance
): Promise<GetPlaylistsResult> {
  const raw = await client.request<SubsonicResponse>("getPlaylists.view", { size: 500 });
  const list = raw?.["subsonic-response"]?.playlists?.playlist ?? [];

  return list.map((pl) => mapPlaylist(pl, { provenance }));
}
