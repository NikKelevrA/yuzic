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

/**
 * The playlist's entries in order: each song's id beside the entry id the
 * server addresses edits by. One song can be several entries.
 */
export async function getPlaylistEntries(
  client: MediaBrowserClient,
  playlistId: string
): Promise<{ songId: string; entryId: string }[]> {
  const raw = await fetchGetPlaylistItems(client, playlistId);
  return (raw?.Items ?? []).map((item) => ({
    songId: item.Id ?? "",
    entryId: item.PlaylistItemId ?? "",
  }));
}
