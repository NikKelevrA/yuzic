import type { Album } from "@/domain/entities/Album";
import type { AlbumDetail } from "@/domain/entities/Detail";
import type { Song } from "@/domain/entities/Song";
import type { LocalId } from "@/domain/identity/LocalId";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapAlbum } from "../mapAlbum";
import { mapSong } from "../mapSong";
import { MediaBrowserItem, MediaBrowserItemsResponse } from "../types";

// Fetches all albums + all songs in 2 requests instead of 2 per album (2N).
export async function getAlbumsWithSongs(
  client: MediaBrowserClient,
): Promise<AlbumDetail[]> {
  const baseParams = client.parentId
    ? `&ParentId=${encodeURIComponent(client.parentId)}`
    : "";

  const isEmby = client.brand.kind === "emby";
  const provenance = requireProvenance(client);

  // Request 1: all album metadata
  const albumsRaw = await client.request<MediaBrowserItemsResponse>(
    `/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=SortName` +
    `&Fields=PrimaryImageTag,${isEmby ? "ImageTags," : ""}Genres,AlbumArtist,ArtistItems,Artists,DateCreated,ProviderIds` +
    baseParams,
  );

  const albumDtoById = new Map<string, MediaBrowserItem>();
  const albumById = new Map<string, Album>();
  for (const a of albumsRaw?.Items ?? []) {
    if (!a.Id) continue;
    albumDtoById.set(a.Id, a);
    albumById.set(a.Id, mapAlbum(a, { provenance, brand: client.brand }));
  }

  if (albumById.size === 0) return [];

  // Request 2: all songs across the entire library
  const songsRaw = await client.request<MediaBrowserItemsResponse>(
    `/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=IndexNumber` +
    `&Fields=RunTimeTicks,ArtistItems,MediaSources,Genres,PremiereDate,DateCreated,AlbumId` +
    baseParams,
  );

  const songsByAlbum = new Map<string, Song[]>();
  for (const s of songsRaw?.Items ?? []) {
    const albumId = s.AlbumId ?? "";
    const album = albumId ? albumById.get(albumId) : undefined;
    if (!album) continue;

    // Emby's list endpoints never resolved an album title on the song there
    // (the endpoint predates `albumTitle` existing at all) — preserved here
    // by simply not passing one, same as the pre-rewrite behaviour.
    const song = mapSong(s, {
      provenance,
      brand: client.brand,
      cover: album.cover,
      albumTitle: isEmby ? undefined : album.title,
      albumId,
    });

    const list = songsByAlbum.get(albumId) ?? [];
    list.push(song);
    songsByAlbum.set(albumId, list);
  }

  const details: AlbumDetail[] = [];
  for (const id of albumById.keys()) {
    const songs = songsByAlbum.get(id) ?? [];
    const songIds: LocalId[] = songs.map((s) => s.localId);
    const dto = albumDtoById.get(id)!;
    details.push({
      album: mapAlbum(dto, { provenance, brand: client.brand, songIds }),
      songs,
    });
  }
  return details;
}
