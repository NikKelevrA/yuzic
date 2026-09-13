import { useIsAudiomuseConfigured } from '@/state/redux/selectors/audiomuseSelectors';
import type { ApiAdapter } from '@/api/types';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { Artist } from '@/domain/entities/Artist';
import { createAudiomuseClient, type AudiomuseConfig } from '@/api/audiomuse/client';
import { getAudiomuseQueueExtension } from '@/api/audiomuse/similarity';

/**
 * "Make me a playlist like this" — the AudioMuse-backed gesture behind the
 * album, artist and song options sheets.
 *
 * Three round trips, in this order: ask AudioMuse for tracks similar to the
 * seed, create the playlist, then add tracks one at a time. The last part is
 * deliberate rather than a batch — AudioMuse indexes the server's own library
 * but can return a track the user's library no longer has, and a batch add
 * would fail the whole playlist over one such row. Each add is allowed to
 * fail on its own, and the seed leads the playlist it generated.
 */
export async function generateSimilarPlaylistForSong(
  api: ApiAdapter,
  audiomuse: AudiomuseConfig,
  seed: Song,
  opts: { size?: number; name?: string } = {}
): Promise<{ playlistId: string; trackCount: number }> {
  const size = Math.max(1, opts.size ?? 25);
  const client = createAudiomuseClient(audiomuse);

  const similar = await getAudiomuseQueueExtension(client, {
    seedItemIds: [seed.nativeId],
    excludeItemIds: [seed.nativeId],
    limit: size,
  });

  const trackIds = [
    seed.nativeId,
    ...similar.map(t => t.itemId).filter(id => id && id !== seed.nativeId),
  ];

  const name = opts.name ?? `Similar to ${seed.title}`;
  const playlistId = await api.playlists.create(name);

  for (const id of trackIds) {
    try {
      await api.playlists.addSong(playlistId, id);
    } catch {
      // Missing library entry / non-navidrome id — skip. A track AudioMuse
      // knows about might not be in the user's own library, and that's OK.
    }
  }

  return { playlistId, trackCount: trackIds.length };
}

/** Derives a seed track from `album` and generates a playlist "Similar to <album>". */
export async function generateSimilarPlaylistForAlbum(
  api: ApiAdapter,
  audiomuse: AudiomuseConfig,
  album: AlbumDetail,
  opts: { size?: number } = {}
): Promise<{ playlistId: string; trackCount: number }> {
  const seed = album.songs[0];
  if (!seed) {
    throw new Error('Album has no tracks to seed a playlist from');
  }
  return generateSimilarPlaylistForSong(api, audiomuse, seed, {
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
  audiomuse: AudiomuseConfig,
  artist: Artist,
  songs: Song[],
  opts: { size?: number } = {}
): Promise<{ playlistId: string; trackCount: number }> {
  const seed = songs[0];
  if (!seed) {
    throw new Error('Artist has no tracks to seed a playlist from');
  }
  return generateSimilarPlaylistForSong(api, audiomuse, seed, {
    size: opts.size,
    name: `Similar to ${artist.name}`,
  });
}

/**
 * Whether the "make a playlist from this" gesture should be offered.
 *
 * A direct configuration read rather than a capability lookup, deliberately:
 * the generic slot lookup pulls in the active server adapter plus the
 * downloader and external-source registries, which every options sheet using
 * this gesture would then have to mock. Both answer the same today. When a
 * second provider can fill `playlist.generate`, this becomes the capability
 * lookup so both count — that is Phase 3's job.
 */
export function useCanGeneratePlaylist(): boolean {
  return useIsAudiomuseConfigured();
}
