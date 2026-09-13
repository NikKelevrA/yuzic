import { deezerClient } from './client';
import { mapAlbum } from './mapAlbum';
import { mapArtist } from './mapArtist';
import { mapSong } from './mapSong';
import type { DeezerAlbum, DeezerArtist, DeezerTrack } from './types';
import type { Artist } from '@/domain/entities/Artist';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { ArtistRef } from '@/domain/entities/EntityRef';
import { integrationProvenance } from '@/domain/identity/Provenance';

const PROVENANCE = integrationProvenance('deezer');

type DeezerListResponse<T> = {
  data?: T[];
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const SEARCH_CACHE_MS = 12 * HOUR_MS;
const ARTIST_CACHE_MS = 7 * DAY_MS;
const ARTIST_ALBUMS_CACHE_MS = DAY_MS;
const RELATED_ARTISTS_CACHE_MS = 7 * DAY_MS;
const TRACKS_CACHE_MS = DAY_MS;
const ALBUM_CACHE_MS = DAY_MS;
const GENRE_CACHE_MS = 30 * DAY_MS;
const CHART_CACHE_MS = 6 * HOUR_MS;
const EMPTY_CACHE_MS = HOUR_MS;

// No expiry sweep runs on its own — an expired entry only gets replaced once
// that exact key is requested again — so without a cap this grows without
// bound over a long session of browsing/searching external catalog data.
const CACHE_MAX_ENTRIES = 500;

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const pendingRequests = new Map<string, Promise<unknown>>();

function cacheTtl<T>(value: T, ttlMs: number): number {
  return Array.isArray(value) && value.length === 0 ? EMPTY_CACHE_MS : ttlMs;
}

async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = memoryCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = pendingRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = loader()
    .then(value => {
      if (!memoryCache.has(key) && memoryCache.size >= CACHE_MAX_ENTRIES) {
        memoryCache.delete(memoryCache.keys().next().value!);
      }
      memoryCache.set(key, {
        expiresAt: Date.now() + cacheTtl(value, ttlMs),
        value,
      });
      return value;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
}

/**
 * Overrides an album's artist reference with `fallbackArtist` when Deezer's
 * DTO carried no embedded artist of its own — the albums-by-artist endpoint
 * routinely omits it. `mapAlbum` cannot do this itself (it only ever sees the
 * DTO), so this is applied as a post-processing step on its result.
 */
function withFallbackArtist(album: Album, dto: DeezerAlbum, fallbackArtist?: Artist | null): Album {
  if (dto.artist?.id != null || !fallbackArtist) return album;
  const artistRef: ArtistRef = {
    localId: fallbackArtist.localId,
    nativeId: fallbackArtist.nativeId,
    externalIds: fallbackArtist.externalIds,
    name: fallbackArtist.name,
    cover: fallbackArtist.cover,
  };
  return { ...album, artist: artistRef };
}

async function requestList<T>(path: string): Promise<T[]> {
  const res = await deezerClient.request<DeezerListResponse<T>>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function searchDeezerArtists(query: string, limit = 5): Promise<Artist[]> {
  if (!query.trim()) return [];
  return cached(`search-artists:${query.trim().toLowerCase()}:${limit}`, SEARCH_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  });
}

export async function searchDeezerAlbums(query: string, limit = 8): Promise<Album[]> {
  if (!query.trim()) return [];
  return cached(`search-albums:${query.trim().toLowerCase()}:${limit}`, SEARCH_CACHE_MS, async () => {
    const albums = await requestList<DeezerAlbum>(`/search/album?q=${encodeURIComponent(query)}&limit=${limit}`);
    return albums.map(dto => mapAlbum(dto, { provenance: PROVENANCE }));
  });
}

export async function getDeezerArtist(artistId: string): Promise<Artist | null> {
  return cached(`artist:${artistId}`, ARTIST_CACHE_MS, async () => {
    const dto = await deezerClient.request<DeezerArtist>(`/artist/${encodeURIComponent(artistId)}`);
    return dto?.id ? mapArtist(dto, PROVENANCE) : null;
  });
}

export async function getDeezerArtistAlbums(
  artistId: string,
  limit = 50,
  fallbackArtist?: Artist | null
): Promise<Album[]> {
  const fallbackKey = fallbackArtist?.nativeId ?? fallbackArtist?.name ?? '';
  return cached(`artist-albums:${artistId}:${limit}:${fallbackKey}`, ARTIST_ALBUMS_CACHE_MS, async () => {
    const albums = await requestList<DeezerAlbum>(`/artist/${encodeURIComponent(artistId)}/albums?limit=${limit}`);
    return albums.map(dto => withFallbackArtist(mapAlbum(dto, { provenance: PROVENANCE }), dto, fallbackArtist));
  });
}

export async function getDeezerRelatedArtists(artistId: string, limit = 12): Promise<Artist[]> {
  return cached(`related-artists:${artistId}:${limit}`, RELATED_ARTISTS_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/artist/${encodeURIComponent(artistId)}/related?limit=${limit}`);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  });
}

export async function getDeezerArtistTopTracks(artistId: string, limit = 10): Promise<Song[]> {
  return cached(`artist-top-tracks:${artistId}:${limit}`, TRACKS_CACHE_MS, async () => {
    const tracks = await requestList<DeezerTrack>(`/artist/${encodeURIComponent(artistId)}/top?limit=${limit}`);
    return tracks
      .filter(track => track.album)
      .map(track => mapSong(track, { provenance: PROVENANCE, album: track.album! }));
  });
}

export async function getDeezerAlbum(albumId: string): Promise<AlbumDetail | null> {
  return cached(`album:${albumId}`, ALBUM_CACHE_MS, async () => {
    const dto = await deezerClient.request<DeezerAlbum>(`/album/${encodeURIComponent(albumId)}`);
    if (!dto?.id) return null;

    const trackDtos = dto.tracks?.data ?? [];
    const songs = trackDtos.map(track => mapSong(track, { provenance: PROVENANCE, album: dto }));
    const album = mapAlbum(dto, { provenance: PROVENANCE, songIds: songs.map(s => s.localId) });

    return { album, songs };
  });
}

export async function resolveDeezerArtistByName(name: string): Promise<Artist | null> {
  if (!name.trim()) return null;
  return cached(`resolve-artist:${name.trim().toLowerCase()}`, SEARCH_CACHE_MS, async () => {
    const [artist] = await searchDeezerArtists(name, 1);
    return artist ?? null;
  });
}

export async function getDeezerGenreList(): Promise<{ id: number; name: string }[]> {
  return cached('genres', GENRE_CACHE_MS, async () => {
    const res = await deezerClient.request<{ data?: { id: number; name: string }[] }>('/genre');
    return res?.data ?? [];
  });
}

export async function getDeezerArtistsByGenreId(genreId: number, limit = 20): Promise<Artist[]> {
  return cached(`genre-artists:${genreId}:${limit}`, GENRE_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/genre/${genreId}/artists?limit=${limit}`);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  });
}

export async function getDeezerChartArtists(limit = 10): Promise<Artist[]> {
  return cached(`chart-artists:${limit}`, CHART_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/chart/0/artists?limit=${limit}`);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  });
}

export async function getDeezerChartAlbums(limit = 10): Promise<Album[]> {
  return cached(`chart-albums:${limit}`, CHART_CACHE_MS, async () => {
    const albums = await requestList<DeezerAlbum>(`/chart/0/albums?limit=${limit * 2}`);
    const seenArtists = new Set<string>();
    const result: Album[] = [];
    for (const dto of albums) {
      const artistKey = (dto.artist?.name ?? '').toLowerCase();
      if (artistKey && seenArtists.has(artistKey)) continue;
      if (artistKey) seenArtists.add(artistKey);
      result.push(mapAlbum(dto, { provenance: PROVENANCE }));
      if (result.length >= limit) break;
    }
    return result;
  });
}

export async function resolveDeezerAlbum(artist: string, title: string): Promise<Album | null> {
  const key = `${artist.trim().toLowerCase()}:${title.trim().toLowerCase()}`;
  return cached(`resolve-album:${key}`, SEARCH_CACHE_MS, async () => {
    const precise = await searchDeezerAlbums(`artist:"${artist}" album:"${title}"`, 1);
    if (precise[0]) return precise[0];
    const fallback = await searchDeezerAlbums(`${artist} ${title}`, 1);
    return fallback[0] ?? null;
  });
}
