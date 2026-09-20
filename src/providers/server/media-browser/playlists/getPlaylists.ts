import type { Playlist } from "@/domain/entities/Playlist";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapPlaylist } from "../mapPlaylist";
import type { MediaBrowserItem } from "../types";
import { fetchAllItems } from "../pagedItems";

type GetPlaylistsResult = Playlist[];

async function fetchGetPlaylists(client: MediaBrowserClient) {
  const path =
    `/Users/${client.userId}/Items` +
    `?IncludeItemTypes=Playlist` +
    `&Recursive=true` +
    `&Fields=Id,Name,PrimaryImageTag,DateCreated,DateLastMediaAdded,ChildCount`;
  return { Items: await fetchAllItems<MediaBrowserItem>(client, path) };
}

export async function getPlaylists(client: MediaBrowserClient): Promise<GetPlaylistsResult> {
  const raw = await fetchGetPlaylists(client);
  const items = raw?.Items ?? [];
  const provenance = requireProvenance(client);
  return items.map((p) => mapPlaylist(p, { provenance, brand: client.brand }));
}
