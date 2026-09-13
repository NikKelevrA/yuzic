import type { Artist } from "@/domain/entities/Artist";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapArtist } from "../mapArtist";
import { MediaBrowserItemsResponse } from "../types";

export type GetArtistsResult = Artist[];

// Prefer /Artists over /Items?IncludeItemTypes=MusicArtist. The generic /Items
// endpoint returns empty on several Jellyfin builds when there is no ParentId
// scoped to a music library (or when the user has no explicit access rule set),
// which is what surfaced as issue #181 — artists visible in the Jellyfin admin
// UI but the app showing an empty list. /Artists is Jellyfin's dedicated
// endpoint and honours the same UserId/ParentId filters both brands support.
export async function getArtists(client: MediaBrowserClient): Promise<GetArtistsResult> {
  const path =
    `/Artists` +
    `?userId=${encodeURIComponent(client.userId)}` +
    `&SortBy=SortName` +
    `&Fields=PrimaryImageTag,Overview,Genres,DateCreated,ProviderIds` +
    (client.parentId ? `&ParentId=${encodeURIComponent(client.parentId)}` : "");

  const raw = await client.request<MediaBrowserItemsResponse>(path);
  const items = raw?.Items ?? [];
  const provenance = requireProvenance(client);

  return items.map((a) => mapArtist(a, { provenance, brand: client.brand }));
}
