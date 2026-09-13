import type { AlbumDetail } from "@/domain/entities/Detail";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapAlbum } from "../mapAlbum";
import { getAlbumSongs } from "./getAlbumSongs";
import { MediaBrowserItemsResponse } from "../types";

export type GetAlbumResult = AlbumDetail | null;

async function fetchGetAlbum(client: MediaBrowserClient, albumId: string) {
  const path =
    `/Items` +
    `?Ids=${encodeURIComponent(albumId)}` +
    `&IncludeItemTypes=MusicAlbum` +
    `&Fields=Genres,ArtistItems,PrimaryImageTag,DateCreated,ProviderIds`;
  return client.request<MediaBrowserItemsResponse>(path);
}

export async function getAlbum(
  client: MediaBrowserClient,
  albumId: string
): Promise<GetAlbumResult> {
  const raw = await fetchGetAlbum(client, albumId);
  const dto = raw?.Items?.[0];
  if (!dto) return null;

  const provenance = requireProvenance(client);
  // The album's own record has no songIds yet; its tracks are fetched
  // against the un-songed album so `getAlbumSongs` can borrow its title and
  // cover for songs, then get folded back in below.
  const bare = mapAlbum(dto, { provenance, brand: client.brand });
  const songs = await getAlbumSongs(client, bare);
  const album = mapAlbum(dto, {
    provenance,
    brand: client.brand,
    songIds: songs.map((s) => s.localId),
  });

  return { album, songs };
}
