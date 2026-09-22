/**
 * Contract tests for the provider declarations the capability broker serves.
 *
 * Every integration module a declaration calls into is mocked here, so these
 * tests prove the wiring — a capability really does call its own provider's
 * implementation — without making a real network request.
 */
import type { Song } from '@/domain/entities/Song';
import type { Artist } from '@/domain/entities/Artist';
import type { Album } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';

// Explicit factories rather than bare `jest.mock(path)`: an automock still
// `require()`s the real module to learn its shape, and several of these
// modules' import chains reach `expo-constants`, which Jest cannot parse
// outside the app's own transform pipeline.
jest.mock('@/providers/integration/deezer', () => ({
  getDeezerAlbum: jest.fn(),
  searchDeezerArtists: jest.fn(),
  searchDeezerAlbums: jest.fn(),
}));
jest.mock('@/providers/integration/musicbrainz', () => ({
  searchArtist: jest.fn(),
  searchReleaseGroupByTitle: jest.fn(),
  searchRecording: jest.fn(),
  getReleaseGroup: jest.fn(),
  getTracksForReleaseGroup: jest.fn(),
  createMusicbrainzClient: jest.fn(),
}));
// The provider reads the address the user has set for a MusicBrainz server of
// their own from the store at the moment of each call.
let mockServerUrls: Record<string, string> = {};
jest.mock('@/state/redux/store', () => ({
  __esModule: true,
  default: { getState: () => ({ settingsSources: { uses: {}, serverUrls: mockServerUrls } }) },
}));
jest.mock('@/providers/integration/musicbrainz/mapAlbum', () => ({ mapAlbum: jest.fn() }));
jest.mock('@/providers/integration/musicbrainz/mapArtist', () => ({ mapArtist: jest.fn() }));
jest.mock('@/providers/integration/musicbrainz/mapSong', () => ({
  mapSong: jest.fn(),
  mapRecordingSearchHit: jest.fn(),
}));
jest.mock('@/providers/integration/lastfm', () => ({ getLastFmArtistInfo: jest.fn() }));
// Last.fm's api_key is a build-time env var, empty in the test environment —
// fix it to a non-empty value so the provider's own "no key, no request"
// guard doesn't mask the wiring this file is testing.
jest.mock('@/constants/keys', () => ({ LASTFM_API_KEY: 'test-lastfm-key' }));

import { deezerProvider } from './deezer';
import { musicbrainzProvider, musicbrainzServerAnswers } from './musicbrainz';
import { lastfmProvider } from './lastfm';
import { KEYLESS_INTEGRATIONS } from './keyless';
import * as deezerApi from '@/providers/integration/deezer';
import * as mbApi from '@/providers/integration/musicbrainz';
import { mapAlbum as mapMbAlbum } from '@/providers/integration/musicbrainz/mapAlbum';
import { mapArtist as mapMbArtist } from '@/providers/integration/musicbrainz/mapArtist';
import { mapSong as mapMbSong, mapRecordingSearchHit as mapMbRecordingSearchHit } from '@/providers/integration/musicbrainz/mapSong';
import * as lastfmApi from '@/providers/integration/lastfm';

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

// --- deezer ----------------------------------------------------------------

describe('deezer provider', () => {
  it('calls its own api module for every declared capability', async () => {
    (deezerApi.getDeezerAlbum as jest.Mock).mockResolvedValue({ album: makeAlbum(), songs: [] });
    (deezerApi.searchDeezerArtists as jest.Mock).mockResolvedValue([makeArtist()]);
    (deezerApi.searchDeezerAlbums as jest.Mock).mockResolvedValue([makeAlbum()]);

    // Pictures are not a capability: they fill gaps through `coverBackups.ts`.
    expect(deezerProvider.capabilities).not.toHaveProperty('artist.enrich');

    await deezerProvider.capabilities['catalogue.album']?.('d-album');
    expect(deezerApi.getDeezerAlbum).toHaveBeenCalledWith('d-album');

    const found = await deezerProvider.capabilities['catalogue.search']?.('query', { artists: true, albums: false });
    expect(deezerApi.searchDeezerArtists).toHaveBeenCalledWith('query', 4);
    expect(deezerApi.searchDeezerAlbums).not.toHaveBeenCalled();
    expect(found?.artists).toHaveLength(1);
  });

  it('is reachable by construction — a keyless public API', async () => {
    expect(await deezerProvider.testConnection()).toEqual({ ok: true });
  });
});

// --- musicbrainz -------------------------------------------------------------

describe('musicbrainz provider', () => {
  it('calls its own api module for every declared capability', async () => {
    (mbApi.searchArtist as jest.Mock).mockResolvedValue([]);
    (mbApi.searchReleaseGroupByTitle as jest.Mock).mockResolvedValue([]);
    (mbApi.getReleaseGroup as jest.Mock).mockResolvedValue({ id: 'mb-rg', title: 'Test Album' });
    (mbApi.getTracksForReleaseGroup as jest.Mock).mockResolvedValue([]);
    (mapMbSong as jest.Mock).mockReturnValue(makeSong());
    (mapMbAlbum as jest.Mock).mockReturnValue(makeAlbum());

    await musicbrainzProvider.capabilities['catalogue.search']?.('query', { artists: true, albums: true });
    expect(mbApi.searchArtist).toHaveBeenCalledWith('query', 3);
    expect(mbApi.searchReleaseGroupByTitle).toHaveBeenCalledWith('query', 3);

    await musicbrainzProvider.capabilities['catalogue.album']?.('mb-rg');
    expect(mbApi.getReleaseGroup).toHaveBeenCalledWith('mb-rg');
    expect(mbApi.getTracksForReleaseGroup).toHaveBeenCalledWith('mb-rg');
    expect(mbApi.createMusicbrainzClient).not.toHaveBeenCalled();
  });

  it('searches recordings only when asked for songs, and maps hits through mapRecordingSearchHit', async () => {
    (mbApi.searchArtist as jest.Mock).mockResolvedValue([]);
    (mbApi.searchReleaseGroupByTitle as jest.Mock).mockResolvedValue([]);
    (mbApi.searchRecording as jest.Mock).mockResolvedValue([{ id: 'rec-1', title: 'Test Song' }]);
    (mapMbRecordingSearchHit as jest.Mock).mockReturnValue(makeSong());

    const found = await musicbrainzProvider.capabilities['catalogue.search']?.(
      'query',
      { artists: false, albums: false, songs: true }
    );

    expect(mbApi.searchRecording).toHaveBeenCalledWith('query', 15);
    expect(mapMbRecordingSearchHit).toHaveBeenCalledWith({ id: 'rec-1', title: 'Test Song' }, expect.anything());
    expect(found?.songs).toHaveLength(1);
    expect(found?.songs?.[0].entity).toEqual(makeSong());
  });

  // A self-hosted server/proxy is code this app doesn't control; one that
  // answers with more than it was asked for (observed in practice) must not
  // be able to flood a search with rows past what the UI is designed to show.
  it('keeps only the first few artists and albums even when the server sends back more than asked', async () => {
    (mbApi.searchArtist as jest.Mock).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `artist-${i}`, name: `Artist ${i}` }))
    );
    (mbApi.searchReleaseGroupByTitle as jest.Mock).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `album-${i}`, title: `Album ${i}` }))
    );
    (mapMbArtist as jest.Mock).mockImplementation(dto => ({ ...makeArtist(), nativeId: dto.id }));
    (mapMbAlbum as jest.Mock).mockImplementation(dto => ({ ...makeAlbum(), nativeId: dto.id }));

    const found = await musicbrainzProvider.capabilities['catalogue.search']?.(
      'query',
      { artists: true, albums: true }
    );

    expect(found?.artists).toHaveLength(3);
    expect(found?.albums).toHaveLength(3);
  });

  it('does not cap songs down to the artist/album limit', async () => {
    (mbApi.searchArtist as jest.Mock).mockResolvedValue([]);
    (mbApi.searchReleaseGroupByTitle as jest.Mock).mockResolvedValue([]);
    (mbApi.searchRecording as jest.Mock).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `rec-${i}`, title: `Song ${i}` }))
    );
    (mapMbRecordingSearchHit as jest.Mock).mockImplementation(dto => ({ ...makeSong(), nativeId: dto.id }));

    const found = await musicbrainzProvider.capabilities['catalogue.search']?.(
      'query',
      { artists: false, albums: false, songs: true }
    );

    expect(found?.songs).toHaveLength(15);
  });

  it('does not search recordings when songs are not asked for', async () => {
    (mbApi.searchArtist as jest.Mock).mockResolvedValue([]);
    (mbApi.searchReleaseGroupByTitle as jest.Mock).mockResolvedValue([]);

    const found = await musicbrainzProvider.capabilities['catalogue.search']?.(
      'query',
      { artists: true, albums: true }
    );

    expect(mbApi.searchRecording).not.toHaveBeenCalled();
    expect(found?.songs).toEqual([]);
  });

  it('drops a recording hit that mapRecordingSearchHit cannot place on an album', async () => {
    (mbApi.searchArtist as jest.Mock).mockResolvedValue([]);
    (mbApi.searchReleaseGroupByTitle as jest.Mock).mockResolvedValue([]);
    (mbApi.searchRecording as jest.Mock).mockResolvedValue([{ id: 'rec-orphan', title: 'No Album' }]);
    (mapMbRecordingSearchHit as jest.Mock).mockReturnValue(null);

    const found = await musicbrainzProvider.capabilities['catalogue.search']?.(
      'query',
      { artists: false, albums: false, songs: true }
    );

    expect(found?.songs).toEqual([]);
  });

  describe('with a server address set', () => {
    afterEach(() => {
      mockServerUrls = {};
    });

    it('asks the server of your own, and not the public one', async () => {
      mockServerUrls = { musicbrainz: 'http://nas:5000' };
      const own = {
        searchArtist: jest.fn().mockResolvedValue([]),
        searchReleaseGroupByTitle: jest.fn().mockResolvedValue([]),
      };
      (mbApi.createMusicbrainzClient as jest.Mock).mockReturnValue(own);

      await musicbrainzProvider.capabilities['catalogue.search']?.('query', { artists: true, albums: true });

      expect(mbApi.createMusicbrainzClient).toHaveBeenCalledWith({ serverUrl: 'http://nas:5000' });
      expect(own.searchArtist).toHaveBeenCalledWith('query', 4);
      expect(own.searchReleaseGroupByTitle).toHaveBeenCalledWith('query', 6);
      expect(mbApi.searchArtist).not.toHaveBeenCalled();
      expect(mbApi.searchReleaseGroupByTitle).not.toHaveBeenCalled();
    });

    it('treats a blank address as none', async () => {
      mockServerUrls = { musicbrainz: '   ' };
      (mbApi.searchArtist as jest.Mock).mockResolvedValue([]);

      await musicbrainzProvider.capabilities['catalogue.search']?.('query', { artists: true, albums: false });

      expect(mbApi.createMusicbrainzClient).not.toHaveBeenCalled();
      expect(mbApi.searchArtist).toHaveBeenCalledWith('query', 4);
    });
  });

  describe('checking a server address', () => {
    it('is satisfied when a client for that address can search', async () => {
      const own = { searchArtist: jest.fn().mockResolvedValue([]) };
      (mbApi.createMusicbrainzClient as jest.Mock).mockReturnValue(own);

      await expect(musicbrainzServerAnswers('http://nas:5000')).resolves.toBe(true);
      expect(mbApi.createMusicbrainzClient).toHaveBeenCalledWith({ serverUrl: 'http://nas:5000' });
    });

    it('is not when the search fails', async () => {
      const own = { searchArtist: jest.fn().mockRejectedValue(new Error('MusicBrainz 503')) };
      (mbApi.createMusicbrainzClient as jest.Mock).mockReturnValue(own);

      await expect(musicbrainzServerAnswers('http://nas:5000')).resolves.toBe(false);
    });
  });
});

// --- lastfm ------------------------------------------------------------------

describe('lastfm provider', () => {
  it('calls its own api module for artist enrichment', async () => {
    (lastfmApi.getLastFmArtistInfo as jest.Mock).mockResolvedValue({ bio: 'bio', tags: ['tag'] });

    const enrichment = await lastfmProvider.capabilities['artist.enrich']?.(makeArtist());
    expect(lastfmApi.getLastFmArtistInfo).toHaveBeenCalledWith(expect.any(String), 'Test Artist');
    expect(enrichment).toEqual({ biography: 'bio', tags: ['tag'] });
  });
});

// --- cross-provider invariants -----------------------------------------------

describe('the keyless integrations, assembled together', () => {
  it('has a unique id per provider', () => {
    const ids = KEYLESS_INTEGRATIONS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(['deezer', 'lastfm', 'musicbrainz']);
  });

  it('declares every capability as a real function', () => {
    for (const provider of KEYLESS_INTEGRATIONS) {
      for (const [name, impl] of Object.entries(provider.capabilities)) {
        expect(typeof impl).toBe('function');
        if (typeof impl !== 'function') throw new Error(`${provider.id}.${name} is not a function`);
      }
    }
  });

  it('declaring a provider invokes no api module — declaration is not invocation', () => {
    // The declarations were imported at the top of this file; nothing may have
    // been called on the way. Mocks are cleared after each test, so this runs
    // against a clean slate only if it is not preceded by an invocation in
    // the same test.
    expect(deezerApi.getDeezerAlbum).not.toHaveBeenCalled();
    expect(deezerApi.searchDeezerArtists).not.toHaveBeenCalled();
    expect(mbApi.searchArtist).not.toHaveBeenCalled();
    expect(lastfmApi.getLastFmArtistInfo).not.toHaveBeenCalled();
  });
});
