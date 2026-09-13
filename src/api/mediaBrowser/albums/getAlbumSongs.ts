import type { Album } from "@/domain/entities/Album";
import type { Song } from "@/domain/entities/Song";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapSong } from "../mapSong";
import { MediaBrowserItemsResponse } from "../types";

export type GetAlbumSongsResult = Song[];

export async function getAlbumSongs(
  client: MediaBrowserClient,
  album: Album
): Promise<GetAlbumSongsResult> {
  const path =
    `/Items` +
    `?ParentId=${encodeURIComponent(album.nativeId)}` +
    `&IncludeItemTypes=Audio` +
    `&Recursive=true` +
    `&SortBy=IndexNumber` +
    `&Fields=RunTimeTicks,ArtistItems,MediaSources,Genres,PremiereDate,DateCreated`;
  const raw = await client.request<MediaBrowserItemsResponse>(path);
  const items = raw?.Items ?? [];
  const provenance = requireProvenance(client);

  return items.map((s) =>
    mapSong(s, {
      provenance,
      brand: client.brand,
      cover: album.cover,
      albumTitle: album.title,
      albumId: album.nativeId,
    })
  );
}
