import {
  ApiAdapter,
  AlbumsApi,
  ArtistsApi,
  GenresApi,
  PlaylistsApi,
  StarredApi,
  SimilarApi,
  SongsApi,
  TracksApi,
  AuthApi,
  LyricsApi,
  SearchApi
} from "@/providers/contracts/ServerAdapter";

import { Server } from "@/providers/contracts/Server";

import { MediaBrowserBrand } from "./brand";
import { createMediaBrowserClient, requireProvenance, MediaBrowserClient } from "./client";
import { connect } from "./auth/connect";
import { ping } from "./auth/ping";
import { testServerUrl } from "./auth/testServerUrl";
import { startScan } from "./auth/startScan";
import { getAlbum } from "./albums/getAlbum";
import { getAlbums } from "./albums/getAlbums";
import { getAlbumsWithSongs } from "./albums/getAlbumsWithSongs";
import { getArtists } from "./artists/getArtists";
import { getPlaylists } from "./playlists/getPlaylists";
import { getPlaylist } from "./playlists/getPlaylist";
import { getPlaylistEntries } from "./playlists/getPlaylistItems";
import { movePlaylistItem } from "./playlists/movePlaylistItem";
import { entryIndex } from "@/providers/server/playlistEntries";
import { createPlaylist } from "./playlists/createPlaylist";
import { deletePlaylist } from "./playlists/deletePlaylist";
import { updatePlaylistName } from "./playlists/updatePlaylistName";
import { addPlaylistItems } from "./playlists/addPlaylistItems";
import { removePlaylistItems } from "./playlists/removePlaylistItems";
import { getStarredItems } from "./starred/getStarredItems";
import { star } from "./starred/star";
import { unstar } from "./starred/unstar";
import { getArtist } from "./artists/getArtist";
import { getGenres } from "./genres/getGenres";
import { buildFavoritesPlaylist } from '@/providers/server/buildFavoritesPlaylist';
import { FAVORITES_ID } from "@/constants/favorites";
import { getLyricsBySongId } from "./lyrics/getLyricsBySongId";
import { getSong } from "./songs/getSong";
import { markPlayed } from "./songs/markPlayed";
import { reportPlaybackStart, reportPlaybackProgress, reportPlaybackStop, clearPlaybackPosition } from "./playback/report";
import { getBookmarksFromUserData } from "./bookmarks/bookmarks";
import { getTracks } from "./tracks/getTracks";
import { getInstantMix } from "./instantMix/getInstantMix";
import { getSimilarAlbums, getSimilarArtists } from "./similar/getSimilarItems";
import { search } from "./search/search";
import { getNowPlaying, getRandomSongs } from "./discovery/discovery";

/**
 * The synthetic "Favorites" playlist, built locally from starred songs
 * rather than fetched — neither brand has a native favorites-as-playlist
 * concept, only a per-item IsFavorite flag. It still needs the same identity
 * contract as a real playlist (a stable `LocalId`, this server's
 * provenance) so the UI can't tell it apart from one that came off the wire
 * except by its id.
 */
/**
 * The adapter both MediaBrowser-derived servers share.
 *
 * Jellyfin and Emby differ only in the handful of details `MediaBrowserBrand`
 * captures, so there is one adapter parameterised by brand rather than two
 * files kept in step by hand. They were two files, identical but for the brand
 * constant and the client factory's name, and had already started to drift.
 *
 * A server whose API is genuinely different — Plex, say — gets its own
 * adapter. This is one protocol with two brands, not a place to put a third
 * protocol behind a flag.
 */
export const createMediaBrowserAdapter = (
  server: Server,
  brand: MediaBrowserBrand
): ApiAdapter => {
  const { id: serverId, serverUrl, fallbackUrls, auth: providerAuth, basicAuth } = server;
  const { token, userId } = providerAuth as { token: string; userId: string };

  // Support new array format (parentIds) and old single-value format (parentId)
  const parentIds: string[] =
    Array.isArray(providerAuth?.parentIds) ? (providerAuth.parentIds as string[]) :
    providerAuth?.parentId ? [String(providerAuth.parentId)] :
    [];

  const client = createMediaBrowserClient({ serverUrl, serverId, fallbackUrls, token, userId, basicAuth }, brand);

  const clientFor = (pid: string) =>
    createMediaBrowserClient({ serverUrl, serverId, fallbackUrls, token, userId, parentId: pid, basicAuth }, brand);

  // Keyed by `keyOf` rather than a hardcoded `.id` — the domain entities this
  // now fans out over carry their identity as `localId`, and `listWithSongs`
  // fans out over `AlbumDetail`, whose identity is nested under `.album`.
  async function fromParents<T>(
    fn: (c: MediaBrowserClient) => Promise<T[]>,
    keyOf: (item: T) => string
  ): Promise<T[]> {
    if (parentIds.length === 0) return fn(client);
    if (parentIds.length === 1) return fn(clientFor(parentIds[0]));
    const all = (await Promise.all(parentIds.map(id => fn(clientFor(id))))).flat();
    const seen = new Set<string>();
    return all.filter(item => {
      const key = keyOf(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const auth: AuthApi = {
    connect: async (serverUrl, username, password) => {
      return connect(brand, serverUrl, username, password);
    },
    ping: async () => {
      if (!token) return false;
      return ping(client);
    },
    testUrl: async (url) => testServerUrl(brand, url),
    startScan: async () => startScan(client),
    disconnect: () => {},
  };

  const albums: AlbumsApi = {
    list: async () => fromParents(c => getAlbums(c), a => a.localId),
    get: async (id: string) => {
      const detail = await getAlbum(client, id);
      if (!detail) throw new Error("Album not found");
      return detail;
    },
    listWithSongs: async () => fromParents(c => getAlbumsWithSongs(c), d => d.album.localId),
  };

  const artists: ArtistsApi = {
    list: async () => fromParents(c => getArtists(c), a => a.localId),
    get: async (id: string) => {
      const artist = await getArtist(client, id);
      if (!artist) throw new Error("Artist not found");
      return artist;
    },
  };

  const genres: GenresApi = {
    list: async () => {
      if (parentIds.length === 0) return getGenres(client);
      if (parentIds.length === 1) return getGenres(clientFor(parentIds[0]));
      const all = (await Promise.all(parentIds.map(id => getGenres(clientFor(id))))).flat();
      return [...new Set(all)];
    },
  };

  const playlists: PlaylistsApi = {
    list: async () => {
      const [base, starred] = await Promise.all([
        getPlaylists(client),
        getStarredItems(client),
      ]);
      const favorites = buildFavoritesPlaylist(starred.songs ?? [], requireProvenance(client));
      return [favorites, ...base];
    },

    get: async (id: string) => {
      if (id === FAVORITES_ID) {
        const starred = await getStarredItems(client);
        const songs = starred.songs ?? [];
        return { playlist: buildFavoritesPlaylist(songs, requireProvenance(client)), songs };
      }
      const detail = await getPlaylist(client, id);
      if (!detail) throw new Error("Playlist not found");
      return detail;
    },

    create: async (name: string) => {
      const id = await createPlaylist(client, name);
      if (!id) throw new Error("Failed to create playlist");
      return id;
    },

    addSong: async (playlistId: string, songId: string) => {
      if (playlistId === FAVORITES_ID) {
        await star(client, songId);
        return;
      }
      await addPlaylistItems(client, playlistId, [songId]);
    },

    removeSong: async (playlistId, songId, position) => {
      if (playlistId === FAVORITES_ID) {
        await unstar(client, songId);
        return;
      }
      const entries = await getPlaylistEntries(client, playlistId);
      const index = entryIndex(entries.map(entry => entry.songId), songId, position);
      await removePlaylistItems(client, playlistId, [entries[index].entryId]);
    },

    moveSong: async (playlistId, move) => {
      if (playlistId === FAVORITES_ID) {
        throw new Error("Favorites has no order to change");
      }
      const entries = await getPlaylistEntries(client, playlistId);
      const index = entryIndex(entries.map(entry => entry.songId), move.songId, move.from);
      const to = Math.max(0, Math.min(move.to, entries.length - 1));
      if (to === index) return;
      await movePlaylistItem(client, playlistId, entries[index].entryId, to);
    },

    rename: async (id: string, newName: string) => {
      if (id === FAVORITES_ID) {
        throw new Error("Cannot rename Favorites playlist");
      }
      await updatePlaylistName(client, id, newName);
    },

    delete: async (id: string) => {
      if (id === FAVORITES_ID) {
        throw new Error("Cannot delete Favorites playlist");
      }
      await deletePlaylist(client, id);
    },
  };

  const starred: StarredApi = {
    list: async () => getStarredItems(client),
    add: async (id: string) => { await star(client, id); },
    remove: async (id: string) => { await unstar(client, id); },
  };

  const songs: SongsApi = {
    get: async (id: string) => getSong(client, id),
    scrobble: async (songId) => markPlayed(client, songId),
    reportNowPlaying: async (songId) => reportPlaybackStart(client, songId, 0),
    buildStreamUrl: (songId, quality, codec) => client.buildStreamUrl(songId, quality, codec),
    scrobbleKind: 'markPlayed',
    streamableCodecs: ['mp3', 'opus'],
    reportPlaybackStart: async (songId, positionMs) => reportPlaybackStart(client, songId, positionMs),
    reportPlaybackProgress: async (songId, positionMs, isPaused) =>
      reportPlaybackProgress(client, songId, positionMs, isPaused),
    reportPlaybackStop: async (songId, positionMs) => reportPlaybackStop(client, songId, positionMs),
  };

  const tracks: TracksApi = {
    list: async () => fromParents(c => getTracks(c), s => s.localId),
    get: async (id: string) => getSong(client, id),
  };

  const similar: SimilarApi = {
    getSimilarSongs: async (songId: string) => getInstantMix(client, songId),
    getSimilarArtists: async (artistId, limit) => getSimilarArtists(client, artistId, limit),
    getSimilarAlbums: async (albumId, limit) => getSimilarAlbums(client, albumId, limit),
  };

  const lyrics: LyricsApi = {
    getBySongId: async (songId) => getLyricsBySongId(client, songId),
  };

  const searchApi: SearchApi = {
    search: async (query: string) => search(client, query),
  };

  // PlaybackPositionTicks IS the bookmark on both brands. Reading pulls every
  // Audio item that has one (Filters=IsResumable); the write side is
  // already handled by the Playing/Progress + Playing/Stopped events we
  // fire from the player. The create() and remove() paths here fire an
  // idempotent Stopped so the local action goes cross-device without
  // waiting for the next real progress tick.
  const bookmarks = {
    list: async () => getBookmarksFromUserData(client),
    create: async (input: { songId: string; positionMs: number }) =>
      reportPlaybackStop(client, input.songId, input.positionMs),
    remove: async (songId: string) => clearPlaybackPosition(client, songId),
  };

  const user = {
    avatarUrl: () => client.buildAvatarUrl(),
  };

  // Home's server shelves. With more than one chosen library each draws its
  // own random page; interleaving them keeps the first library from taking
  // the whole rail once the shelf trims to its length.
  const discovery = {
    getRandomSongs: async (opts?: { size?: number; genre?: string; fromYear?: number; toYear?: number }) => {
      if (parentIds.length <= 1) return getRandomSongs(parentIds.length ? clientFor(parentIds[0]) : client, opts);
      const draws = await Promise.all(parentIds.map(id => getRandomSongs(clientFor(id), opts)));
      const merged = [];
      for (let i = 0; draws.some(draw => i < draw.length); i++) {
        for (const draw of draws) if (draw[i]) merged.push(draw[i]);
      }
      return merged.slice(0, opts?.size ?? merged.length);
    },
    getNowPlaying: async () => getNowPlaying(client),
  };

  return {
    auth,
    albums,
    artists,
    genres,
    playlists,
    starred,
    songs,
    tracks,
    similar,
    lyrics,
    search: searchApi,
    bookmarks,
    user,
    discovery,
  };
};
