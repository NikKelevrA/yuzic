import type { PlaylistDetail } from "@/domain/entities/Detail";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapPlaylist } from "../mapPlaylist";
import { getPlaylistItems } from "./getPlaylistItems";
import { getPlaylistPermissions } from "./getPlaylistPermissions";
import { MediaBrowserItemsResponse } from "../types";

type GetPlaylistResult = PlaylistDetail | null;

async function fetchGetPlaylist(client: MediaBrowserClient, playlistId: string) {
  const path =
    `/Users/${client.userId}/Items` +
    `?Ids=${encodeURIComponent(playlistId)}` +
    `&IncludeItemTypes=Playlist` +
    `&Fields=Id,Name,PrimaryImageTag,DateCreated,DateLastMediaAdded`;
  return client.request<MediaBrowserItemsResponse>(path);
}

export async function getPlaylist(
  client: MediaBrowserClient,
  playlistId: string
): Promise<GetPlaylistResult> {
  const raw = await fetchGetPlaylist(client, playlistId);
  const dto = raw?.Items?.[0];
  if (!dto) return null;

  const provenance = requireProvenance(client);
  const [songs, permissions] = await Promise.all([
    getPlaylistItems(client, playlistId),
    getPlaylistPermissions(client, playlistId),
  ]);
  const playlist = {
    ...mapPlaylist(dto, {
      provenance,
      brand: client.brand,
      songIds: songs.map((s) => s.localId),
    }),
    // Only the detail asks: one lookup per playlist would be one per row on a list.
    ...(permissions ?? {}),
  };

  return { playlist, songs };
}
