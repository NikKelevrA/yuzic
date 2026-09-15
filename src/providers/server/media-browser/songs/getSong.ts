import type { Song } from "@/domain/entities/Song";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapSong } from "../mapSong";
import { MediaBrowserItemsResponse } from "../types";

export async function getSong(
  client: MediaBrowserClient,
  songId: string
): Promise<Song | null> {
  try {
    const path =
      `/Users/${client.userId}/Items` +
      `?Ids=${encodeURIComponent(songId)}` +
      `&Fields=RunTimeTicks,ArtistItems,AlbumId,MediaSources,Genres,PremiereDate,DateCreated`;

    const raw = await client.request<MediaBrowserItemsResponse>(path);
    const dto = raw?.Items?.[0];
    if (!dto || dto.Type !== "Audio") return null;

    return mapSong(dto, { provenance: requireProvenance(client), brand: client.brand });
  } catch (error) {
    console.error(`Failed to fetch ${client.brand.label} song:`, error);
    throw error;
  }
}
