import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import { requireProvenance, type MediaBrowserClient } from '../client';
import { mapAlbum } from '../mapAlbum';
import { mapArtist } from '../mapArtist';
import { mapSong } from '../mapSong';
import { MediaBrowserItemsResponse } from '../types';

export async function search(
  client: MediaBrowserClient,
  query: string
): Promise<{ albums: Album[]; artists: Artist[]; songs: Song[] }> {
  if (!query.trim()) {
    return { albums: [], artists: [], songs: [] };
  }

  const [albumsRes, artistsRes, songsRes] = await Promise.allSettled([
    client.request<MediaBrowserItemsResponse>(
      `/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=MusicAlbum&Recursive=true&Limit=20&Fields=DateCreated,ProviderIds,ArtistItems,PrimaryImageTag,Genres`,
      { tokenOnly: true }
    ),
    client.request<MediaBrowserItemsResponse>(
      `/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=MusicArtist&Recursive=true&Limit=20&Fields=ProviderIds,PrimaryImageTag`,
      { tokenOnly: true }
    ),
    client.request<MediaBrowserItemsResponse>(
      `/Users/${encodeURIComponent(client.userId)}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=Audio&Recursive=true&Limit=20&Fields=RunTimeTicks,ArtistItems,AlbumId,MediaSources,Genres`,
      { tokenOnly: true }
    ),
  ]);

  const albumItems = albumsRes.status === 'fulfilled' ? (albumsRes.value.Items ?? []) : [];
  const artistItems = artistsRes.status === 'fulfilled' ? (artistsRes.value.Items ?? []) : [];
  const songItems = songsRes.status === 'fulfilled' ? (songsRes.value.Items ?? []) : [];

  const provenance = requireProvenance(client);

  return {
    albums: albumItems.map((item) => mapAlbum(item, { provenance, brand: client.brand })),
    artists: artistItems.map((item) => mapArtist(item, { provenance, brand: client.brand })),
    songs: songItems.map((item) => mapSong(item, { provenance, brand: client.brand })),
  };
}
