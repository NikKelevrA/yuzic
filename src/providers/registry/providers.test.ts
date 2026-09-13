/**
 * Cross-provider contract tests for Task 3.3's declarations.
 *
 * Every `src/api/<provider>` module a declaration calls into is mocked here,
 * so these tests prove the wiring — a capability really does call its own
 * provider's implementation — without making a real network request.
 */
import type { ApiAdapter } from '@/api/types';
import type { Song } from '@/domain/entities/Song';
import type { Artist } from '@/domain/entities/Artist';
import type { Album } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { Provider } from '../contracts/Provider';

// Explicit factories rather than bare `jest.mock(path)`: an automock still
// `require()`s the real module to learn its shape, and several of these
// modules' import chains reach `expo-constants`, which Jest cannot parse
// outside the app's own transform pipeline. Same pattern as
// `src/hooks/scrobbleRouting.test.tsx`.
jest.mock('@/api/deezer', () => ({
  resolveDeezerArtistByName: jest.fn(),
  getDeezerArtist: jest.fn(),
  resolveDeezerAlbum: jest.fn(),
  getDeezerRelatedArtists: jest.fn(),
  getDeezerChartAlbums: jest.fn(),
  getDeezerAlbum: jest.fn(),
}));
jest.mock('@/api/musicbrainz', () => ({
  searchArtist: jest.fn(),
  searchReleaseGroup: jest.fn(),
  getReleaseGroup: jest.fn(),
  getTracksForReleaseGroup: jest.fn(),
}));
jest.mock('@/api/musicbrainz/mapAlbum', () => ({ mapAlbum: jest.fn() }));
jest.mock('@/api/musicbrainz/mapSong', () => ({ mapSong: jest.fn() }));
jest.mock('@/api/lastfm', () => ({
  getLastFmArtistInfo: jest.fn(),
  getLastFmSimilarArtists: jest.fn(),
}));
jest.mock('@/api/listenbrainz', () => ({
  getLBSimilarArtists: jest.fn(),
  submitScrobble: jest.fn(),
  testConnection: jest.fn(),
}));
jest.mock('@/api/lrclib', () => ({ getLyrics: jest.fn() }));
jest.mock('@/api/audiomuse/client', () => ({ createAudiomuseClient: jest.fn() }));
jest.mock('@/api/audiomuse/similarity', () => ({ getAudiomuseQueueExtension: jest.fn() }));
jest.mock('@/api/audiomuse/ping', () => ({ testConnection: jest.fn() }));
jest.mock('@/api/lidarr', () => ({ downloadAlbum: jest.fn(), testConnection: jest.fn() }));
jest.mock('@/api/slskd', () => ({ downloadAlbum: jest.fn(), downloadTrack: jest.fn(), testConnection: jest.fn() }));
class MockSoulSyncError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
jest.mock('@/api/soulsync', () => ({
  downloadTrack: jest.fn(),
  testConnection: jest.fn(),
  SoulSyncError: MockSoulSyncError,
}));
// Last.fm's api_key is a build-time env var, empty in the test environment —
// fix it to a non-empty value so the provider's own "no key, no request"
// guard doesn't mask the wiring this file is testing.
jest.mock('@/constants/keys', () => ({ LASTFM_API_KEY: 'test-lastfm-key' }));

afterEach(() => {
  jest.clearAllMocks();
});

// --- fixtures ----------------------------------------------------------------

const SERVER_PROVENANCE = serverProvenance('srv-1');

function makeArtist(over: Partial<Artist> = {}): Artist {
  const provenance = over.provenance ?? SERVER_PROVENANCE;
  return {
    localId: makeLocalId('artist', provenance, 'artist-1'),
    nativeId: 'artist-1',
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    name: 'Test Artist',
    cover: { kind: 'none' },
    tags: [],
    albumIds: [],
    ...over,
  };
}

function makeAlbum(over: Partial<Album> = {}): Album {
  const provenance = over.provenance ?? SERVER_PROVENANCE;
  return {
    localId: makeLocalId('album', provenance, 'album-1'),
    nativeId: 'album-1',
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: 'Test Album',
    cover: { kind: 'none' },
    artist: makeArtist(),
    releaseType: 'album',
    genres: [],
    songIds: [],
    ...over,
  };
}

function makeSong(over: Partial<Song> = {}): Song {
  const provenance = over.provenance ?? SERVER_PROVENANCE;
  return {
    localId: makeLocalId('song', provenance, 'song-1'),
    nativeId: 'song-1',
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: 'Test Song',
    artist: makeArtist(),
    album: makeAlbum(),
    cover: { kind: 'none' },
    durationSeconds: 180,
    contentKind: 'song',
    genres: [],
    ...over,
  };
}

/** A minimal `ApiAdapter` with a jest.fn() for every required member. */
function makeFakeApi(over: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    auth: {
      connect: jest.fn(async () => ({ success: true })),
      ping: jest.fn(async () => true),
      testUrl: jest.fn(async () => ({ success: true })),
      startScan: jest.fn(async () => ({ success: true })),
      disconnect: jest.fn(),
    },
    albums: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => { throw new Error('not found'); }),
    },
    artists: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => makeArtist()),
    },
    genres: { list: jest.fn(async () => []) },
    playlists: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => { throw new Error('not found'); }),
      create: jest.fn(async () => 'playlist-1'),
      rename: jest.fn(async () => {}),
      addSong: jest.fn(async () => ({ success: true })),
      removeSong: jest.fn(async () => ({ success: true })),
      delete: jest.fn(async () => {}),
    },
    starred: {
      list: jest.fn(async () => ({ songs: [], albums: [] })),
      add: jest.fn(async () => {}),
      remove: jest.fn(async () => {}),
    },
    songs: {
      get: jest.fn(async () => makeSong()),
      scrobble: jest.fn(async () => {}),
      buildStreamUrl: jest.fn(() => 'stream://song-1'),
      scrobbleKind: 'scrobble',
      streamableCodecs: [],
    },
    tracks: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => null),
    },
    similar: {
      getSimilarSongs: jest.fn(async () => []),
    },
    lyrics: {
      getBySongId: jest.fn(async () => null),
    },
    search: {
      search: jest.fn(async () => ({ albums: [], artists: [], songs: [] })),
    },
    ...over,
  };
}

// --- server providers ----------------------------------------------------

import {
  createNavidromeProvider,
  createJellyfinProvider,
  createEmbyProvider,
  createPlexProvider,
  createLocalProvider,
} from './providers';

describe('server providers', () => {
  it('declare similarity.artists only when the adapter implements it', () => {
    const withArtists = makeFakeApi({
      similar: { getSimilarSongs: jest.fn(async () => []), getSimilarArtists: jest.fn(async () => []) },
    });
    const withoutArtists = makeFakeApi();

    expect(createNavidromeProvider(withArtists).capabilities['similarity.artists']).toBeInstanceOf(Function);
    expect(createJellyfinProvider(withArtists).capabilities['similarity.artists']).toBeInstanceOf(Function);
    expect(createEmbyProvider(withArtists).capabilities['similarity.artists']).toBeInstanceOf(Function);
    expect(createPlexProvider(withoutArtists).capabilities['similarity.artists']).toBeUndefined();
    expect(createLocalProvider(withoutArtists).capabilities['similarity.artists']).toBeUndefined();
  });

  it('every server capability calls its own adapter, not a hardcoded one', async () => {
    const api = makeFakeApi({
      similar: { getSimilarSongs: jest.fn(async () => [makeSong()]), getSimilarArtists: jest.fn(async () => [makeArtist()]) },
    });
    const provider = createNavidromeProvider(api);

    await provider.capabilities.lyrics?.(makeSong());
    expect(api.lyrics.getBySongId).toHaveBeenCalledWith('song-1');

    await provider.capabilities['similarity.songs']?.(makeSong(), 5);
    expect(api.similar.getSimilarSongs).toHaveBeenCalledWith('song-1');

    await provider.capabilities['similarity.artists']?.(makeArtist(), 5);
    expect(api.similar.getSimilarArtists).toHaveBeenCalledWith('artist-1', 5);

    await provider.capabilities.scrobble?.({ song: makeSong(), startedAt: 1000 });
    expect(api.songs.scrobble).toHaveBeenCalledWith('song-1', 1000);
  });

  it('testConnection pings the given adapter', async () => {
    const api = makeFakeApi();
    const health = await createJellyfinProvider(api).testConnection();
    expect(api.auth.ping).toHaveBeenCalledTimes(1);
    expect(health.ok).toBe(true);
  });

  it('local files need no account', () => {
    expect(createLocalProvider(makeFakeApi()).auth.tier).toBe('none');
  });
});

// --- deezer ----------------------------------------------------------------

import { deezerProvider } from './providers';
import * as deezerApi from '@/api/deezer';

describe('deezer provider', () => {
  it('calls its own api module for every declared capability', async () => {
    (deezerApi.resolveDeezerArtistByName as jest.Mock).mockResolvedValue(makeArtist({ nativeId: 'd-artist' }));
    (deezerApi.getDeezerArtist as jest.Mock).mockResolvedValue(makeArtist({ nativeId: 'd-artist' }));
    (deezerApi.resolveDeezerAlbum as jest.Mock).mockResolvedValue(makeAlbum({ nativeId: 'd-album' }));
    (deezerApi.getDeezerRelatedArtists as jest.Mock).mockResolvedValue([makeArtist()]);
    (deezerApi.getDeezerChartAlbums as jest.Mock).mockResolvedValue([makeAlbum()]);
    (deezerApi.getDeezerAlbum as jest.Mock).mockResolvedValue({ album: makeAlbum(), songs: [] });

    await deezerProvider.capabilities['artist.enrich']?.(makeArtist());
    expect(deezerApi.resolveDeezerArtistByName).toHaveBeenCalledWith('Test Artist');
    expect(deezerApi.getDeezerArtist).toHaveBeenCalledWith('d-artist');

    await deezerProvider.capabilities['album.enrich']?.(makeAlbum());
    expect(deezerApi.resolveDeezerAlbum).toHaveBeenCalledWith('Test Artist', 'Test Album');

    await deezerProvider.capabilities['similarity.artists']?.(makeArtist(), 8);
    expect(deezerApi.getDeezerRelatedArtists).toHaveBeenCalledWith('d-artist', 8);

    await deezerProvider.capabilities['discovery.shelf']?.();
    expect(deezerApi.getDeezerChartAlbums).toHaveBeenCalledWith(20);

    await deezerProvider.capabilities['catalogue.album']?.('d-album');
    expect(deezerApi.getDeezerAlbum).toHaveBeenCalledWith('d-album');
  });

  it('is reachable by construction — a keyless public API', async () => {
    expect(await deezerProvider.testConnection()).toEqual({ ok: true });
  });
});

// --- musicbrainz -------------------------------------------------------------

import { musicbrainzProvider } from './providers';
import * as mbApi from '@/api/musicbrainz';
import { mapAlbum as mapMbAlbum } from '@/api/musicbrainz/mapAlbum';
import { mapSong as mapMbSong } from '@/api/musicbrainz/mapSong';

describe('musicbrainz provider', () => {
  it('calls its own api module for every declared capability', async () => {
    (mbApi.searchArtist as jest.Mock).mockResolvedValue([{ id: 'mb-artist', name: 'Test Artist', annotation: 'bio' }]);
    (mbApi.searchReleaseGroup as jest.Mock).mockResolvedValue([{ id: 'mb-rg', title: 'Test Album' }]);
    (mbApi.getReleaseGroup as jest.Mock).mockResolvedValue({ id: 'mb-rg', title: 'Test Album' });
    (mbApi.getTracksForReleaseGroup as jest.Mock).mockResolvedValue([]);
    (mapMbSong as jest.Mock).mockReturnValue(makeSong());
    (mapMbAlbum as jest.Mock).mockReturnValue(makeAlbum());

    await musicbrainzProvider.capabilities['artist.enrich']?.(makeArtist());
    expect(mbApi.searchArtist).toHaveBeenCalledWith('Test Artist', 1);

    await musicbrainzProvider.capabilities['album.enrich']?.(makeAlbum());
    expect(mbApi.searchReleaseGroup).toHaveBeenCalledWith('Test Artist', 'Test Album', 1);

    await musicbrainzProvider.capabilities['catalogue.album']?.('mb-rg');
    expect(mbApi.getReleaseGroup).toHaveBeenCalledWith('mb-rg');
    expect(mbApi.getTracksForReleaseGroup).toHaveBeenCalledWith('mb-rg');
  });
});

// --- lastfm ------------------------------------------------------------------

import { lastfmProvider } from './providers';
import * as lastfmApi from '@/api/lastfm';

describe('lastfm provider', () => {
  it('calls its own api module for every declared capability', async () => {
    (lastfmApi.getLastFmArtistInfo as jest.Mock).mockResolvedValue({ bio: 'bio', tags: ['tag'] });
    (lastfmApi.getLastFmSimilarArtists as jest.Mock).mockResolvedValue([
      { name: 'Similar', mbid: null, match: 0.9, image: null },
    ]);

    await lastfmProvider.capabilities['artist.enrich']?.(makeArtist());
    expect(lastfmApi.getLastFmArtistInfo).toHaveBeenCalledWith(expect.any(String), 'Test Artist');

    const similar = await lastfmProvider.capabilities['similarity.artists']?.(makeArtist(), 10);
    expect(lastfmApi.getLastFmSimilarArtists).toHaveBeenCalledWith(expect.any(String), 'Test Artist', 10);
    expect(similar?.[0]?.name).toBe('Similar');
  });
});

// --- listenbrainz ------------------------------------------------------------

import { createListenBrainzProvider } from './providers';
import * as lbApi from '@/api/listenbrainz';

describe('listenbrainz provider', () => {
  const config = { username: 'u', token: 't' };

  it('calls its own api module for every declared capability', async () => {
    (lbApi.getLBSimilarArtists as jest.Mock).mockResolvedValue([
      { artistMbid: 'mb-1', name: 'Similar', score: 1 },
    ]);
    (lbApi.submitScrobble as jest.Mock).mockResolvedValue(undefined);
    (lbApi.testConnection as jest.Mock).mockResolvedValue({ success: true });

    const provider = createListenBrainzProvider(config);

    const similar = await provider.capabilities['similarity.artists']?.(makeArtist({ externalIds: { mbid: 'seed-mbid' } }), 12);
    expect(lbApi.getLBSimilarArtists).toHaveBeenCalledWith('seed-mbid', 12);
    expect(similar?.[0]?.nativeId).toBe('mb-1');

    await provider.capabilities.scrobble?.({ song: makeSong(), startedAt: 1234000 });
    expect(lbApi.submitScrobble).toHaveBeenCalledWith(config, expect.objectContaining({
      artist: 'Test Artist',
      track: 'Test Song',
      listenedAt: 1234,
    }));

    await provider.testConnection();
    expect(lbApi.testConnection).toHaveBeenCalledWith(config);
  });

  it('returns nothing for similarity.artists when the seed has no mbid, rather than guessing', async () => {
    const provider = createListenBrainzProvider(config);
    const result = await provider.capabilities['similarity.artists']?.(makeArtist({ externalIds: {} }), 12);
    expect(result).toEqual([]);
    expect(lbApi.getLBSimilarArtists).not.toHaveBeenCalled();
  });
});

// --- lrclib --------------------------------------------------------------

import { lrclibProvider } from './providers';
import * as lrclibApi from '@/api/lrclib';

describe('lrclib provider', () => {
  it('calls its own api module for lyrics', async () => {
    (lrclibApi.getLyrics as jest.Mock).mockResolvedValue({ provider: 'lrclib', synced: true, lines: [] });

    await lrclibProvider.capabilities.lyrics?.(makeSong());
    expect(lrclibApi.getLyrics).toHaveBeenCalledWith({
      artist: 'Test Artist',
      title: 'Test Song',
      album: 'Test Album',
      durationSec: 180,
    });
  });
});

// --- audiomuse -----------------------------------------------------------

import { createAudiomuseProvider, type AudiomuseProviderDeps } from './providers';
import { createAudiomuseClient } from '@/api/audiomuse/client';
import { getAudiomuseQueueExtension } from '@/api/audiomuse/similarity';
import { testConnection as testAudiomuseConnection } from '@/api/audiomuse/ping';

describe('audiomuse provider', () => {
  const config: AudiomuseProviderDeps['config'] = { serverUrl: 'https://audiomuse', apiToken: 'tok' };

  it('resolves similarity refs through the given ApiAdapter, not a stub', async () => {
    const fakeClient = { request: jest.fn() };
    (createAudiomuseClient as jest.Mock).mockReturnValue(fakeClient);
    (getAudiomuseQueueExtension as jest.Mock).mockResolvedValue([{ itemId: 'song-2' }]);
    const api = makeFakeApi({ songs: { ...makeFakeApi().songs, get: jest.fn(async () => makeSong({ nativeId: 'song-2' })) } });

    const provider = createAudiomuseProvider({ config, api });
    const similar = await provider.capabilities['similarity.songs']?.(makeSong(), 10);

    expect(getAudiomuseQueueExtension).toHaveBeenCalledWith(fakeClient, {
      seedItemIds: ['song-1'],
      excludeItemIds: ['song-1'],
      limit: 10,
    });
    expect(api.songs.get).toHaveBeenCalledWith('song-2');
    expect(similar?.[0]?.nativeId).toBe('song-2');
  });

  it('generates a playlist on the given adapter, seeding it with the song itself', async () => {
    const fakeClient = { request: jest.fn() };
    (createAudiomuseClient as jest.Mock).mockReturnValue(fakeClient);
    (getAudiomuseQueueExtension as jest.Mock).mockResolvedValue([]);
    const api = makeFakeApi();

    const provider = createAudiomuseProvider({ config, api });
    const playlistId = await provider.capabilities['playlist.generate']?.(makeSong(), 25);

    expect(api.playlists.create).toHaveBeenCalledWith('Similar to Test Song');
    expect(api.playlists.addSong).toHaveBeenCalledWith('playlist-1', 'song-1');
    expect(playlistId).toBe('playlist-1');
  });

  it('testConnection reuses the existing ping-based check', async () => {
    (testAudiomuseConnection as jest.Mock).mockResolvedValue(undefined);
    const provider = createAudiomuseProvider({ config, api: makeFakeApi() });
    expect(await provider.testConnection()).toEqual({ ok: true });
    expect(testAudiomuseConnection).toHaveBeenCalledWith(config);
  });
});

// --- downloaders -----------------------------------------------------------

import { createLidarrProvider } from './providers';
import * as lidarrApi from '@/api/lidarr';
import { createSlskdProvider } from './providers';
import * as slskdApi from '@/api/slskd';
import { createSoulSyncProvider } from './providers';
import * as soulsyncApi from '@/api/soulsync';

describe('lidarr provider', () => {
  const config = { serverUrl: 'https://lidarr', apiKey: 'k' };

  it('declares acquisition.album only, and calls its own downloadAlbum', async () => {
    const provider = createLidarrProvider(config);
    expect(provider.capabilities['acquisition.track']).toBeUndefined();

    (lidarrApi.downloadAlbum as jest.Mock).mockResolvedValue({ success: true, status: 'submitted' });
    const result = await provider.capabilities['acquisition.album']?.({
      artist: 'Artist', title: 'Album', externalIds: { mbid: 'mb-1', deezerId: 'dz-1' },
    });
    expect(lidarrApi.downloadAlbum).toHaveBeenCalledWith(config, {
      albumTitle: 'Album', artistName: 'Artist', albumMbid: 'mb-1', albumDeezerId: 'dz-1',
    });
    expect(result).toEqual({ accepted: true, message: undefined });
  });
});

describe('slskd provider', () => {
  const config = { serverUrl: 'https://slskd', apiKey: 'k' };

  it('declares both units and calls its own downloaders', async () => {
    const provider = createSlskdProvider(config);
    (slskdApi.downloadAlbum as jest.Mock).mockResolvedValue({ success: true });
    (slskdApi.downloadTrack as jest.Mock).mockResolvedValue({ success: false, message: 'nope' });

    await provider.capabilities['acquisition.album']?.({ artist: 'A', title: 'B', externalIds: {} });
    expect(slskdApi.downloadAlbum).toHaveBeenCalledWith(config, { title: 'B', artist: 'A', mbid: null });

    const trackResult = await provider.capabilities['acquisition.track']?.({ artist: 'A', title: 'B', externalIds: {} });
    expect(slskdApi.downloadTrack).toHaveBeenCalledWith(config, { title: 'B', artist: 'A' });
    expect(trackResult).toEqual({ accepted: false, message: 'nope' });
  });
});

describe('soulsync provider', () => {
  const config = { serverUrl: 'https://soulsync', apiKey: 'k' };

  it('declares acquisition.track only, and calls its own downloadTrack', async () => {
    const provider = createSoulSyncProvider(config);
    expect(provider.capabilities['acquisition.album']).toBeUndefined();

    (soulsyncApi.downloadTrack as jest.Mock).mockResolvedValue({ requestId: 'r1' });
    const result = await provider.capabilities['acquisition.track']?.({ artist: 'A', title: 'B', externalIds: {} });
    expect(soulsyncApi.downloadTrack).toHaveBeenCalledWith(config, { title: 'B', artist: 'A' });
    expect(result).toEqual({ accepted: true });
  });
});

// --- cross-provider invariants -----------------------------------------------

describe('every provider, assembled together', () => {
  function allProviders(): Provider[] {
    const api = makeFakeApi({
      similar: { getSimilarSongs: jest.fn(async () => []), getSimilarArtists: jest.fn(async () => []) },
    });
    return [
      createNavidromeProvider(api),
      createJellyfinProvider(api),
      createEmbyProvider(api),
      createPlexProvider(api),
      createLocalProvider(api),
      deezerProvider,
      musicbrainzProvider,
      lastfmProvider,
      createListenBrainzProvider({ username: 'u', token: 't' }),
      lrclibProvider,
      createAudiomuseProvider({ config: { serverUrl: 'https://a', apiToken: 't' }, api }),
      createLidarrProvider({ serverUrl: 'https://l', apiKey: 'k' }),
      createSlskdProvider({ serverUrl: 'https://s', apiKey: 'k' }),
      createSoulSyncProvider({ serverUrl: 'https://ss', apiKey: 'k' }),
    ];
  }

  it('has a unique id per provider', () => {
    const ids = allProviders().map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([
      'audiomuse', 'deezer', 'emby', 'jellyfin', 'lastfm', 'lidarr', 'listenbrainz',
      'local', 'lrclib', 'musicbrainz', 'navidrome', 'plex', 'slskd', 'soulsync',
    ]);
  });

  it('declares every capability as a real function', () => {
    for (const provider of allProviders()) {
      for (const [name, impl] of Object.entries(provider.capabilities)) {
        expect(typeof impl).toBe('function');
        if (typeof impl !== 'function') throw new Error(`${provider.id}.${name} is not a function`);
      }
    }
  });

  it('constructing every provider invokes no api module — declaration is not invocation', () => {
    // Mocks are cleared before every test (see the top-level `afterEach`), so
    // any call recorded here was made by `allProviders()` itself, not by an
    // earlier test's capability invocations.
    allProviders();
    expect(deezerApi.getDeezerAlbum).not.toHaveBeenCalled();
    expect(deezerApi.resolveDeezerArtistByName).not.toHaveBeenCalled();
    expect(mbApi.searchArtist).not.toHaveBeenCalled();
    expect(lastfmApi.getLastFmArtistInfo).not.toHaveBeenCalled();
    expect(lrclibApi.getLyrics).not.toHaveBeenCalled();
    expect(lidarrApi.downloadAlbum).not.toHaveBeenCalled();
    expect(slskdApi.downloadAlbum).not.toHaveBeenCalled();
    expect(soulsyncApi.downloadTrack).not.toHaveBeenCalled();
    expect(lbApi.submitScrobble).not.toHaveBeenCalled();
    expect(lbApi.getLBSimilarArtists).not.toHaveBeenCalled();
  });
});
