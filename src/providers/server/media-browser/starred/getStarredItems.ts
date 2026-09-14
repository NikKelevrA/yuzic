import type { Album } from "@/domain/entities/Album";
import type { Song } from "@/domain/entities/Song";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapSong } from "../mapSong";
import { normalizeAlbum } from "../albums/getAlbums";
import { MediaBrowserItemsResponse } from "../types";

interface GetStarredItemsResult {
  songs: Song[];
  albums: Album[];
}

async function fetchGetStarredSongs(client: MediaBrowserClient) {
  const path =
    `/Users/${client.userId}/Items` +
    `?Recursive=true` +
    `&Filters=IsFavorite` +
    `&IncludeItemTypes=Audio` +
    `&Fields=Id,Name,Artists,AlbumId,RunTimeTicks,ImageTags,MediaSources,Genres,PremiereDate,DateCreated`;
  return client.request<MediaBrowserItemsResponse>(path);
}

async function fetchGetStarredAlbums(client: MediaBrowserClient) {
  const path =
    `/Users/${client.userId}/Items` +
    `?Recursive=true` +
    `&Filters=IsFavorite` +
    `&IncludeItemTypes=MusicAlbum` +
    `&Fields=PrimaryImageTag,Genres,AlbumArtist,ArtistItems,Artists,DateCreated,ProviderIds,UserData`;
  return client.request<MediaBrowserItemsResponse>(path);
}

export async function getStarredItems(
  client: MediaBrowserClient
): Promise<GetStarredItemsResult> {
  try {
    const [songsRaw, albumsRaw] = await Promise.all([
      fetchGetStarredSongs(client),
      fetchGetStarredAlbums(client),
    ]);

    const provenance = requireProvenance(client);
    const songItems = songsRaw?.Items ?? [];
    const albumItems = albumsRaw?.Items ?? [];

    return {
      songs: songItems.map((s) => mapSong(s, { provenance, brand: client.brand })),
      albums: albumItems.map((a) => normalizeAlbum(a, client)).filter((a): a is Album => a !== null),
    };
  } catch (error) {
    console.error(`Failed to fetch ${client.brand.label} starred items:`, error);
    return { songs: [], albums: [] };
  }
}
