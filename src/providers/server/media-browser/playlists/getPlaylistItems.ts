import type { Song } from "@/domain/entities/Song";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapSong } from "../mapSong";
import { MediaBrowserItemsResponse } from "../types";

type GetPlaylistItemsResult = Song[];

async function fetchGetPlaylistItems(
  client: MediaBrowserClient,
  playlistId: string
) {
  const path = `/Playlists/${playlistId}/Items?userId=${client.userId}`;
  return client.request<MediaBrowserItemsResponse>(path);
}

export async function getPlaylistItems(
  client: MediaBrowserClient,
  playlistId: string
): Promise<GetPlaylistItemsResult> {
  const raw = await fetchGetPlaylistItems(client, playlistId);
  const items = raw?.Items ?? [];
  const provenance = requireProvenance(client);
  return items.map((s) => mapSong(s, { provenance, brand: client.brand }));
}

/** Resolve song ID to the server's PlaylistItemId (required for remove). */
export async function getPlaylistEntryIdForSong(
  client: MediaBrowserClient,
  playlistId: string,
  songId: string
): Promise<string | null> {
  const raw = await fetchGetPlaylistItems(client, playlistId);
  const items = raw?.Items ?? [];
  const item = items.find((s) => s.Id === songId);
  return item?.PlaylistItemId ?? null;
}
