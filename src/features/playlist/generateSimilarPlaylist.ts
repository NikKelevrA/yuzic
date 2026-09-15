import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import { useSimilarityService, type SimilarityService } from '@/providers/registry/similarityService';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { Artist } from '@/domain/entities/Artist';

/**
 * "Make me a playlist like this" — the similarity-service gesture behind the
 * album, artist and song options sheets.
 *
 * Three round trips, in this order: ask the service for tracks similar to the
 * seed, create the playlist, then add tracks one at a time. The last part is
 * deliberate rather than a batch — the service indexes the server's own
 * library but can return a track the user's library no longer has, and a
 * batch add would fail the whole playlist over one such row. Each add is
 * allowed to fail on its own, and the seed leads the playlist it generated.
 */
export async function generateSimilarPlaylistForSong(
  api: ApiAdapter,
  similarity: SimilarityService,
  seed: Song,
  opts: { size?: number; name?: string } = {}
): Promise<{ playlistId: string; trackCount: number }> {
  const size = Math.max(1, opts.size ?? 25);

  const similar = await similarity.similarTrackIds({
    seedItemIds: [seed.nativeId],
    excludeItemIds: [seed.nativeId],
    limit: size,
  });

  const trackIds = [
    seed.nativeId,
    ...similar.filter(id => id && id !== seed.nativeId),
  ];

  const name = opts.name ?? `Similar to ${seed.title}`;
  const playlistId = await api.playlists.create(name);

  for (const id of trackIds) {
    try {
      await api.playlists.addSong(playlistId, id);
    } catch {
      // A track the service knows about might not be in the user's own
      // library any more, and that's OK — skip it.
    }
  }

  return { playlistId, trackCount: trackIds.length };
}

/** Derives a seed track from `album` and generates a playlist "Similar to <album>". */
export async function generateSimilarPlaylistForAlbum(
  api: ApiAdapter,
  similarity: SimilarityService,
  album: AlbumDetail,
  opts: { size?: number } = {}
): Promise<{ playlistId: string; trackCount: number }> {
  const seed = album.songs[0];
  if (!seed) {
    throw new Error('Album has no tracks to seed a playlist from');
  }
  return generateSimilarPlaylistForSong(api, similarity, seed, {
    size: opts.size,
    name: `Similar to ${album.album.title}`,
  });
}

/**
 * Derives a seed track from `songs` (the artist's known tracks) and
 * generates a playlist "Similar to <artist>". `songs` is passed in rather
 * than read off `artist` because `Artist` doesn't carry a song list.
 */
export async function generateSimilarPlaylistForArtist(
  api: ApiAdapter,
  similarity: SimilarityService,
  artist: Artist,
  songs: Song[],
  opts: { size?: number } = {}
): Promise<{ playlistId: string; trackCount: number }> {
  const seed = songs[0];
  if (!seed) {
    throw new Error('Artist has no tracks to seed a playlist from');
  }
  return generateSimilarPlaylistForSong(api, similarity, seed, {
    size: opts.size,
    name: `Similar to ${artist.name}`,
  });
}

/**
 * Whether the "make a playlist from this" gesture should be offered.
 *
 * A similarity service is the only thing that can generate a playlist, so
 * this asks whether one is connected. There is no `playlist.generate`
 * capability: one was declared once and never asked for (see
 * `providers/contracts/Capabilities.ts`). If a second generator arrives, that
 * is when the capability is worth having.
 */
export function useCanGeneratePlaylist(): boolean {
  return useSimilarityService() !== null;
}
