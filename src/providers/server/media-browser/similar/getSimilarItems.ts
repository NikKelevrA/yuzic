import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import { requireProvenance, type MediaBrowserClient } from '../client';
import type { MediaBrowserItemsResponse } from '../types';
import { mapArtist } from '../mapArtist';
import { normalizeAlbum } from '../albums/getAlbums';

/**
 * /Items/{id}/Similar is Jellyfin/Emby's own similarity graph — driven by
 * shared metadata (genres, studios, era, provider ids). Only useful for
 * artists and albums here; for songs the app already uses /InstantMix, which
 * is a stronger seed-and-fill signal.
 */
async function fetchSimilar(
  client: MediaBrowserClient,
  itemId: string,
  limit: number,
  includeItemTypes: string,
  fields?: string
) {
  const path =
    `/Items/${encodeURIComponent(itemId)}/Similar` +
    `?UserId=${encodeURIComponent(client.userId)}` +
    `&Limit=${limit}` +
    `&IncludeItemTypes=${includeItemTypes}` +
    (fields ? `&Fields=${encodeURIComponent(fields)}` : '');
  const res = await client.request<MediaBrowserItemsResponse>(path);
  return res?.Items ?? [];
}

export async function getSimilarAlbums(
  client: MediaBrowserClient,
  albumId: string,
  limit = 12
): Promise<Album[]> {
  const items = await fetchSimilar(
    client,
    albumId,
    limit,
    'MusicAlbum',
    'PrimaryImageTag,Genres,AlbumArtist,ArtistItems,Artists,DateCreated,ProviderIds,UserData'
  );
  return items
    .map((a) => normalizeAlbum(a, client))
    .filter((a): a is Album => a !== null);
}

/**
 * Full domain artists, carrying this server's own provenance — the caller
 * relates them to library records through matching (see
 * `@/domain/identity/matching`) rather than through a second, thinner type.
 */
export async function getSimilarArtists(
  client: MediaBrowserClient,
  artistId: string,
  limit = 12
): Promise<Artist[]> {
  const items = await fetchSimilar(client, artistId, limit, 'MusicArtist', 'PrimaryImageTag,Overview,ProviderIds');
  const provenance = requireProvenance(client);
  return items
    .filter((s) => s.Id && s.Type === 'MusicArtist')
    .map((s) => mapArtist(s, { provenance, brand: client.brand }));
}
