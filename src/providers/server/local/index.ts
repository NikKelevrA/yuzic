import type { ApiAdapter, AlbumsApi, ArtistsApi, AuthApi, GenresApi, LyricsApi, PlaylistsApi, SearchApi, SimilarApi, SongsApi, StarredApi, TracksApi } from '@/providers/contracts/ServerAdapter';
import type { Server } from '@/types/Server';
import type { AlbumDetail, PlaylistDetail } from '@/domain/entities/Detail';
import { serverProvenance } from '@/domain/identity/Provenance';
import { addLocalPlaylist, readLocalLibrary, removeLocalPlaylist, setLocalStarred, updateLocalPlaylist } from './store';
import type { LocalTrack } from './store';
import { mapSong } from './mapSong';
import { mapAlbum } from './mapAlbum';
import type { LocalAlbumGroup } from './mapAlbum';
import { mapArtist } from './mapArtist';
import type { LocalArtistGroup } from './mapArtist';
import { mapPlaylist } from './mapPlaylist';

function groupBy(tracks: LocalTrack[], key: 'albumId' | 'artistId'): Map<string, LocalTrack[]> {
  const groups = new Map<string, LocalTrack[]>();
  for (const track of tracks) groups.set(track[key], [...(groups.get(track[key]) ?? []), track]);
  return groups;
}

function albumGroups(): LocalAlbumGroup[] {
  return [...groupBy(readLocalLibrary().tracks, 'albumId')].map(([albumId, tracks]) => ({ albumId, tracks }));
}

function artistGroups(): LocalArtistGroup[] {
  return [...groupBy(readLocalLibrary().tracks, 'artistId')].map(([artistId, tracks]) => ({ artistId, tracks }));
}

/** Local files deliberately use the same ApiAdapter as a server. That keeps all
 * catalog and player consumers on one capability-driven path; only transport
 * differences live here, where streams are ordinary private file URIs. */
export function createLocalAdapter(server: Server): ApiAdapter {
  // Local files are owned by the user on this device, not browsed from an
  // integration's catalogue — so, like every other server, they get server
  // provenance built once here and threaded into every mapper call. `Server.id`
  // is a required field; an adapter constructed without one is a programming
  // error upstream, not a data case this layer should paper over.
  if (!server.id) throw new Error('createLocalAdapter requires a server with an id.');
  const provenance = serverProvenance(server.id);

  const auth: AuthApi = {
    connect: async () => ({ success: true }), ping: async () => true, testUrl: async () => ({ success: true }),
    startScan: async () => ({ success: true }), disconnect: () => {},
  };

  const tracks: TracksApi = {
    list: async () => readLocalLibrary().tracks.map(track => mapSong(track, { provenance })),
    get: async (id) => {
      const track = readLocalLibrary().tracks.find(item => item.id === id);
      return track ? mapSong(track, { provenance }) : null;
    },
  };

  const songs: SongsApi = {
    get: tracks.get,
    scrobble: async () => {},
    // A local track's streamId (or, absent that, nativeId) is already the
    // private file URI the importer copied the audio to — nothing to build.
    buildStreamUrl: (uri) => uri,
    scrobbleKind: 'scrobble',
    streamableCodecs: [],
  };

  const albumApi: AlbumsApi = {
    list: async () => albumGroups().map(group => mapAlbum(group, { provenance })),
    get: async (id): Promise<AlbumDetail> => {
      const group = albumGroups().find(item => item.albumId === id);
      if (!group) throw new Error('Album not found');
      const albumSongs = group.tracks.map(track => mapSong(track, { provenance }));
      const album = mapAlbum(group, { provenance, songIds: albumSongs.map(song => song.localId) });
      return { album, songs: albumSongs };
    },
    listWithSongs: async () => Promise.all(albumGroups().map(async group => albumApi.get(group.albumId))),
  };

  const artistApi: ArtistsApi = {
    list: async () => artistGroups().map(group => mapArtist(group, provenance)),
    get: async (id) => {
      const group = artistGroups().find(item => item.artistId === id);
      if (!group) throw new Error('Artist not found');
      return mapArtist(group, provenance);
    },
  };

  const genres: GenresApi = { list: async () => [] };

  const starred: StarredApi = {
    list: async () => {
      const snapshot = readLocalLibrary();
      const ids = new Set(snapshot.starredIds);
      const starredSongs = snapshot.tracks.filter(track => ids.has(track.id)).map(track => mapSong(track, { provenance }));
      const starredAlbums = albumGroups()
        .filter(group => group.tracks.some(track => ids.has(track.id)))
        .map(group => mapAlbum(group, { provenance }));
      return { songs: starredSongs, albums: starredAlbums };
    },
    add: async (id) => setLocalStarred(id, true),
    remove: async (id) => setLocalStarred(id, false),
  };

  const playlists: PlaylistsApi = {
    list: async () => readLocalLibrary().playlists.map(entry => mapPlaylist(entry, { provenance })),
    get: async (id): Promise<PlaylistDetail> => {
      const entry = readLocalLibrary().playlists.find(item => item.id === id);
      if (!entry) throw new Error('Playlist not found');
      const trackMap = new Map(readLocalLibrary().tracks.map(track => [track.id, track]));
      const orderedSongs = entry.trackIds.flatMap(trackId => {
        const track = trackMap.get(trackId);
        return track ? [mapSong(track, { provenance })] : [];
      });
      const playlist = mapPlaylist(entry, { provenance, songIds: orderedSongs.map(song => song.localId) });
      return { playlist, songs: orderedSongs };
    },
    create: async (name) => addLocalPlaylist(name),
    rename: async (id, title) => updateLocalPlaylist(id, { title }),
    addSong: async (playlistId, songId) => {
      const entry = readLocalLibrary().playlists.find(item => item.id === playlistId);
      if (!entry) throw new Error('Playlist not found');
      updateLocalPlaylist(playlistId, { trackIds: [...entry.trackIds, songId] });
      return { success: true };
    },
    removeSong: async (playlistId, songId) => {
      const entry = readLocalLibrary().playlists.find(item => item.id === playlistId);
      if (!entry) throw new Error('Playlist not found');
      const index = entry.trackIds.indexOf(songId);
      if (index < 0) return { success: false, message: 'Song not found in playlist.' };
      updateLocalPlaylist(playlistId, { trackIds: entry.trackIds.filter((_, i) => i !== index) });
      return { success: true };
    },
    delete: async (id) => removeLocalPlaylist(id),
  };

  const similar: SimilarApi = { getSimilarSongs: async () => [] };
  const lyrics: LyricsApi = { getBySongId: async () => null };

  const search: SearchApi = {
    search: async (query) => {
      const term = query.trim().toLocaleLowerCase();
      if (!term) return { albums: [], artists: [], songs: [] };
      const [albumList, artistList, songList] = await Promise.all([albumApi.list(), artistApi.list(), tracks.list()]);
      return {
        albums: albumList.filter(album => `${album.title} ${album.artist.name}`.toLocaleLowerCase().includes(term)),
        artists: artistList.filter(artist => artist.name.toLocaleLowerCase().includes(term)),
        songs: songList.filter(song => `${song.title} ${song.artist.name} ${song.album.title}`.toLocaleLowerCase().includes(term)),
      };
    },
  };

  return { auth, albums: albumApi, artists: artistApi, genres, playlists, starred, songs, tracks, similar, lyrics, search };
}
