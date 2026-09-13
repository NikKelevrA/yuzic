import type {
  ApiAdapter,
  AlbumsApi,
  ArtistsApi,
  AuthApi,
  GenresApi,
  LyricsApi,
  PlaylistsApi,
  SearchApi,
  SimilarApi,
  SongsApi,
  StarredApi,
  TracksApi,
} from '@/api/types';
import type { Server } from '@/types';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail, PlaylistDetail } from '@/domain/entities/Detail';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { PlexMetadata, PlexResponse } from './types';
import { createPlexClient } from './client';
import type { PlexClient } from './client';
import { mapSong } from './mapSong';
import { mapAlbum } from './mapAlbum';
import { mapArtist } from './mapArtist';
import { mapPlaylist } from './mapPlaylist';

const FAVORITE_RATING = 10;
const PAGE_SIZE = 200;

function metadata(response: PlexResponse): PlexMetadata[] {
  return response.MediaContainer?.Metadata ?? [];
}

/**
 * Plex returns a page even when a catalog has thousands of entries; its API
 * requires X-Plex-Container headers rather than an implicit unlimited list.
 * Keep paging here so every catalog consumer cannot accidentally ship a
 * first-page-only view.
 */
async function pagedMetadata(client: PlexClient, path: string): Promise<PlexMetadata[]> {
  const result: PlexMetadata[] = [];
  let start = 0;

  while (true) {
    const response = await client.request<PlexResponse>(path, {
      headers: {
        'X-Plex-Container-Start': String(start),
        'X-Plex-Container-Size': String(PAGE_SIZE),
      },
    });
    const page = metadata(response);
    result.push(...page);

    const total = Number(response.MediaContainer?.totalSize);
    if (!page.length || !Number.isFinite(total) || result.length >= total) return result;

    start += page.length;
  }
}

function sectionIds(server: Server): string[] {
  const current = server.auth?.sectionIds;
  if (Array.isArray(current)) return current.map(String);
  const legacy = server.auth?.sectionId;
  return legacy ? [String(legacy)] : [];
}

/** Plex is a distinct protocol, deliberately not a MediaBrowser brand. */
export function createPlexAdapter(server: Server): ApiAdapter {
  const token = server.auth?.token as string | undefined;
  const client = createPlexClient({
    serverUrl: server.serverUrl,
    serverId: server.id,
    fallbackUrls: server.fallbackUrls,
    token,
    basicAuth: server.basicAuth,
  });
  const sections = sectionIds(server);
  // Built once at the client boundary and threaded into every mapper call —
  // every entity this adapter produces comes from this one server.
  const provenance = serverProvenance(server.id);

  async function libraryItems(type: number, extra = ''): Promise<PlexMetadata[]> {
    const ids = sections.length ? sections : (await client.request<PlexResponse>('/library/sections')).MediaContainer?.Directory?.map(s => String(s.key)).filter(Boolean) ?? [];
    const responses = await Promise.all(ids.map(section =>
      pagedMetadata(client, `/library/sections/${encodeURIComponent(section)}/all?type=${type}${extra}`)
    ));
    const seen = new Set<string>();
    return responses.flat().filter(item => {
      const key = String(item.ratingKey ?? '');
      return key && !seen.has(key) && (seen.add(key), true);
    });
  }

  async function item(id: string): Promise<PlexMetadata | null> {
    const result = await client.request<PlexResponse>(`/library/metadata/${encodeURIComponent(id)}`);
    return metadata(result)[0] ?? null;
  }

  async function itemTracks(id: string): Promise<PlexMetadata[]> {
    return pagedMetadata(client, `/library/metadata/${encodeURIComponent(id)}/children`);
  }

  function mapTracks(items: PlexMetadata[]): Song[] {
    return items.filter(track => track.type === 'track').map(track => mapSong(track, { provenance }));
  }

  async function albumDetail(dto: PlexMetadata, trackItems: PlexMetadata[]): Promise<AlbumDetail> {
    const songs = mapTracks(trackItems);
    const album = mapAlbum(dto, { provenance, songIds: songs.map(song => song.localId) });
    return { album, songs };
  }

  const auth: AuthApi = {
    connect: async () => ({ success: false, message: 'Plex uses code sign-in.' }),
    ping: async () => {
      if (!token) return false;
      // /identity is intentionally public; a protected endpoint is required to
      // distinguish an invalid/expired account token from a reachable server.
      try { await client.request('/library/sections'); return true; } catch { return false; }
    },
    testUrl: async (url) => {
      try {
        const probe = createPlexClient({ serverUrl: url, basicAuth: server.basicAuth });
        await probe.request('/identity');
        return { success: true };
      } catch { return { success: false, message: 'Plex server is not responding.' }; }
    },
    startScan: async () => ({ success: false, message: 'Plex scans are managed on the server.' }),
    disconnect: () => {},
  };

  const albums: AlbumsApi = {
    list: async () => (await libraryItems(9)).map(dto => mapAlbum(dto, { provenance })),
    get: async (id) => {
      const [album, trackItems] = await Promise.all([item(id), itemTracks(id)]);
      if (!album) throw new Error('Album not found');
      return albumDetail(album, trackItems);
    },
    listWithSongs: async () => {
      const base = await libraryItems(9);
      return Promise.all(base.map(async album => albumDetail(album, await itemTracks(String(album.ratingKey)))));
    },
  };

  const artists: ArtistsApi = {
    list: async () => (await libraryItems(8)).map(dto => mapArtist(dto, provenance)),
    get: async (id) => {
      const artist = await item(id);
      if (!artist) throw new Error('Artist not found');
      // An artist's children under Plex are its albums, not its tracks.
      const albumIds = (await itemTracks(id))
        .filter(entry => entry.type === 'album')
        .map(entry => makeLocalId('album', provenance, String(entry.ratingKey ?? '')));
      return { ...mapArtist(artist, provenance), albumIds };
    },
  };

  const genres: GenresApi = {
    // Plex's collection-level genre endpoint varies by server/scanner. Album
    // Genre tags are present on the live server, so derive the stable union
    // from those rather than relying on an unverified endpoint.
    list: async () => [...new Set((await libraryItems(9)).flatMap(album => album.Genre?.map(g => g.tag ?? '') ?? []).filter(Boolean))].sort(),
  };

  const tracks: TracksApi = {
    list: async () => mapTracks(await libraryItems(10)),
    get: async (id) => {
      const track = await item(id);
      return track?.type === 'track' ? mapSong(track, { provenance }) : null;
    },
  };

  const songs: SongsApi = {
    get: tracks.get,
    buildStreamUrl: (partKey) => client.buildStreamUrl(partKey),
    // Plex receives explicit playback/scrobble events; it is not a
    // MediaBrowser "mark played" endpoint.
    scrobbleKind: 'scrobble',
    streamableCodecs: [],
    scrobble: async (songId) => { await client.request(`/:/scrobble?key=${encodeURIComponent(`/library/metadata/${songId}`)}`); },
    reportNowPlaying: async (songId) => { await client.request(`/:/timeline?ratingKey=${encodeURIComponent(songId)}&state=playing&time=0`); },
    reportPlaybackStart: async (songId, positionMs) => { await client.request(`/:/timeline?ratingKey=${encodeURIComponent(songId)}&state=playing&time=${Math.max(0, Math.floor(positionMs))}`); },
    reportPlaybackProgress: async (songId, positionMs, paused) => { await client.request(`/:/timeline?ratingKey=${encodeURIComponent(songId)}&state=${paused ? 'paused' : 'playing'}&time=${Math.max(0, Math.floor(positionMs))}`); },
    reportPlaybackStop: async (songId, positionMs) => { await client.request(`/:/timeline?ratingKey=${encodeURIComponent(songId)}&state=stopped&time=${Math.max(0, Math.floor(positionMs))}`); },
  };

  const starred: StarredApi = {
    list: async () => {
      const items = await libraryItems(10, `&userRating=${FAVORITE_RATING}`);
      const songs = mapTracks(items);
      const albums = (await libraryItems(9, `&userRating=${FAVORITE_RATING}`)).map(dto => mapAlbum(dto, { provenance }));
      return { songs, albums };
    },
    add: async (id) => { await client.request(`/:/rate?key=${encodeURIComponent(`/library/metadata/${id}`)}&rating=${FAVORITE_RATING}`, { method: 'PUT' }); },
    remove: async (id) => { await client.request(`/:/rate?key=${encodeURIComponent(`/library/metadata/${id}`)}&rating=0`, { method: 'PUT' }); },
  };

  const playlists: PlaylistsApi = {
    list: async () => (await pagedMetadata(client, '/playlists?playlistType=audio')).map(dto => mapPlaylist(dto, { provenance })),
    get: async (id): Promise<PlaylistDetail> => {
      const base = metadata(await client.request<PlexResponse>(`/playlists/${encodeURIComponent(id)}`))[0];
      if (!base) throw new Error('Playlist not found');
      const entries = await pagedMetadata(client, `/playlists/${encodeURIComponent(id)}/items`);
      const songs = mapTracks(entries);
      const playlist = mapPlaylist(base, { provenance, songIds: songs.map(song => song.localId) });
      return { playlist, songs };
    },
    create: async () => { throw new Error('Creating Plex playlists is not available yet.'); },
    rename: async () => { throw new Error('Renaming Plex playlists is not available yet.'); },
    addSong: async () => ({ success: false, message: 'Editing Plex playlists is not available yet.' }),
    removeSong: async () => ({ success: false, message: 'Editing Plex playlists is not available yet.' }),
    delete: async () => { throw new Error('Deleting Plex playlists is not available yet.'); },
  };

  const similar: SimilarApi = { getSimilarSongs: async () => [] };
  const lyrics: LyricsApi = { getBySongId: async () => null };
  const search: SearchApi = {
    search: async (query) => {
      if (!query.trim()) return { albums: [], artists: [], songs: [] };
      const response = await client.request<PlexResponse>(`/hubs/search?query=${encodeURIComponent(query)}`);
      const results = response.MediaContainer?.Hub?.flatMap(hub => hub.Metadata ?? []) ?? metadata(response);
      return {
        albums: results.filter(result => result.type === 'album').map(dto => mapAlbum(dto, { provenance })),
        artists: results.filter(result => result.type === 'artist').map(dto => mapArtist(dto, provenance)),
        songs: mapTracks(results),
      };
    },
  };

  return { auth, albums, artists, genres, playlists, starred, songs, tracks, similar, lyrics, search };
}
