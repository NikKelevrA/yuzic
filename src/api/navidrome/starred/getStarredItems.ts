import type { Album } from "@/domain/entities/Album";
import type { Song } from "@/domain/entities/Song";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapAlbum } from "../mapAlbum";
import { mapSong } from "../mapSong";
import { SubsonicResponse } from "../types";

export interface GetStarredItemsResult {
  songs: Song[];
  albums: Album[];
}

export async function getStarredItems(
  client: NavidromeClient,
  provenance: Provenance
): Promise<GetStarredItemsResult> {
  const raw = await client.request<SubsonicResponse>("getStarred.view");
  const starred = raw?.["subsonic-response"]?.starred ?? {};

  return {
    albums: (starred.album ?? []).map((a) => mapAlbum(a, { provenance })),
    songs: (starred.song ?? [])
      .filter((s): s is typeof s & { id: string } => !!s?.id)
      .map((s) => mapSong(s, { provenance })),
  };
}
