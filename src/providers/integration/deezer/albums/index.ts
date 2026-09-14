import { deezerClient } from '../client';
import { resolveDeezerAlbum } from '../catalog';
import type { DeezerPreviewTrack } from '../types';

// Re-exported: mapSong.ts and existing consumers import this type from
// wherever `searchAlbumPreviews` (below) is declared. The type itself lives
// in `../types` to avoid an import cycle (catalog -> mapSong -> here ->
// catalog) — see that module's doc comment.
export type { DeezerPreviewTrack } from '../types';

type DeezerAlbumSearchResult = {
  id: number;
  title: string;
  artist: { name: string };
};

type DeezerSearchResponse = {
  data: DeezerAlbumSearchResult[];
};

type DeezerTracksResponse = {
  data: DeezerPreviewTrack[];
};

async function searchAlbum(query: string): Promise<DeezerAlbumSearchResult | null> {
  const res = await deezerClient.request<DeezerSearchResponse>(
    `/search/album?q=${encodeURIComponent(query)}&limit=5`
  );
  return res.data?.[0] ?? null;
}

/**
 * Searches Deezer for an album by artist + title, then fetches its tracks
 * with 30s preview URLs. Returns an empty array if nothing is found.
 *
 * Strategy:
 * 1. Advanced search: artist:"X" album:"Y"  — most precise
 * 2. Fallback: plain "artist album" query    — handles punctuation/formatting differences
 */
export async function searchAlbumPreviews(
  artist: string,
  albumTitle: string
): Promise<DeezerPreviewTrack[]> {
  const resolved = await resolveDeezerAlbum(artist, albumTitle);
  let album = resolved
    ? { id: Number(resolved.nativeId), title: resolved.title, artist: { name: resolved.artist.name } }
    : null;

  album ??=
    await searchAlbum(`artist:"${artist}" album:"${albumTitle}"`) ??
    await searchAlbum(`${artist} ${albumTitle}`);

  if (!album) return [];

  const tracksRes = await deezerClient.request<DeezerTracksResponse>(
    `/album/${album.id}/tracks`
  );

  return tracksRes.data?.filter(t => !!t.preview) ?? [];
}
