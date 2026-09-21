import type { Playlist } from "@/domain/entities/Playlist";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapPlaylist } from "../mapPlaylist";
import type { MediaBrowserItem } from "../types";
import { fetchAllItems } from "../pagedItems";

type GetPlaylistsResult = Playlist[];

export async function getPlaylists(client: MediaBrowserClient): Promise<GetPlaylistsResult> {
  const path =
    `/Users/${client.userId}/Items` +
    `?IncludeItemTypes=Playlist` +
    `&Recursive=true` +
    `&Fields=Id,Name,PrimaryImageTag,DateCreated,DateLastMediaAdded,ChildCount`;
  const provenance = requireProvenance(client);

  return fetchAllItems<MediaBrowserItem, Playlist>(client, path, (p) =>
    mapPlaylist(p, { provenance, brand: client.brand })
  );
}
