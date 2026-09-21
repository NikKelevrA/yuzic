import type { Album } from "@/domain/entities/Album";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapAlbum } from "../mapAlbum";
import type { MediaBrowserItem } from "../types";
import { fetchAllItems } from "../pagedItems";

type GetAlbumsResult = Album[];

/**
 * Shared with `getStarredItems` and `getSimilarItems` — every endpoint that
 * hands back a bare album listing (no tracks) goes through this one
 * normalizer, so a DTO never gets a second, drifting mapping path.
 */
export function normalizeAlbum(a: MediaBrowserItem, client: MediaBrowserClient): Album | null {
  if (!a.Id) return null;
  try {
    return mapAlbum(a, { provenance: requireProvenance(client), brand: client.brand });
  } catch (error) {
    console.error(`Failed to normalize album:`, error);
    return null;
  }
}

export async function getAlbums(
  client: MediaBrowserClient,
  artistId?: string
): Promise<GetAlbumsResult> {
  const baseParams =
    `IncludeItemTypes=MusicAlbum` +
    `&Recursive=true` +
    `&SortBy=SortName` +
    `&Fields=PrimaryImageTag,Genres,AlbumArtist,ArtistItems,Artists,DateCreated,ProviderIds,UserData`;

  const path =
    `/Items?${baseParams}` +
    (artistId ? `&AlbumArtistIds=${encodeURIComponent(artistId)}` : "") +
    (client.parentId ? `&ParentId=${encodeURIComponent(client.parentId)}` : "");

  // Normalized per page: see `fetchAllItems` for why the mapping happens
  // inside the walk rather than over the finished array.
  return fetchAllItems<MediaBrowserItem, Album>(client, path, (a) => normalizeAlbum(a, client));
}
