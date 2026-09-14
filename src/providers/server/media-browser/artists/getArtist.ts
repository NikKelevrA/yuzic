import type { Artist } from "@/domain/entities/Artist";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapArtist } from "../mapArtist";
import { MediaBrowserItemsResponse } from "../types";

type GetArtistResult = Artist | null;

export async function getArtist(
  client: MediaBrowserClient,
  artistId: string
): Promise<GetArtistResult> {
  const path =
    `/Items` +
    `?Ids=${encodeURIComponent(artistId)}` +
    `&IncludeItemTypes=MusicArtist` +
    `&Fields=PrimaryImageTag,Overview,Genres,DateCreated,ProviderIds`;

  const raw = await client.request<MediaBrowserItemsResponse>(path);
  const dto = raw?.Items?.[0];
  if (!dto) return null;

  return mapArtist(dto, { provenance: requireProvenance(client), brand: client.brand });
}
