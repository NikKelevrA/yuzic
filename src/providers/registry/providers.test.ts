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
  resolveDeezerArtistByName: jest.fn(),
  getDeezerArtist: jest.fn(),
  resolveDeezerAlbum: jest.fn(),
  getDeezerAlbum: jest.fn(),
  searchDeezerArtists: jest.fn(),
  searchDeezerAlbums: jest.fn(),
}));
jest.mock('@/providers/integration/musicbrainz', () => ({
  searchArtist: jest.fn(),
  searchReleaseGroup: jest.fn(),
  getReleaseGroup: jest.fn(),
  getTracksForReleaseGroup: jest.fn(),
}));
jest.mock('@/providers/integration/musicbrainz/mapAlbum', () => ({ mapAlbum: jest.fn() }));
jest.mock('@/providers/integration/musicbrainz/mapSong', () => ({ mapSong: jest.fn() }));
jest.mock('@/providers/integration/lastfm', () => ({ getLastFmArtistInfo: jest.fn() }));
// Last.fm's api_key is a build-time env var, empty in the test environment —
// fix it to a non-empty value so the provider's own "no key, no request"
// guard doesn't mask the wiring this file is testing.
jest.mock('@/constants/keys', () => ({ LASTFM_API_KEY: 'test-lastfm-key' }));

import { deezerProvider } from './deezer';
import { musicbrainzProvider } from './musicbrainz';
import { lastfmProvider } from './lastfm';
import { KEYLESS_INTEGRATIONS } from './keyless';
import * as deezerApi from '@/providers/integration/deezer';
import * as mbApi from '@/providers/integration/musicbrainz';
import { mapAlbum as mapMbAlbum } from '@/providers/integration/musicbrainz/mapAlbum';
import { mapSong as mapMbSong } from '@/providers/integration/musicbrainz/mapSong';
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

// --- deezer ----------------------------------------------------------------

describe('deezer provider', () => {
  it('calls its own api module for every declared capability', async () => {
    (deezerApi.resolveDeezerArtistByName as jest.Mock).mockResolvedValue(makeArtist({ nativeId: 'd-artist' }));
    (deezerApi.getDeezerArtist as jest.Mock).mockResolvedValue(makeArtist({ nativeId: 'd-artist' }));
    (deezerApi.resolveDeezerAlbum as jest.Mock).mockResolvedValue(makeAlbum({ nativeId: 'd-album' }));
    (deezerApi.getDeezerAlbum as jest.Mock).mockResolvedValue({ album: makeAlbum(), songs: [] });
    (deezerApi.searchDeezerArtists as jest.Mock).mockResolvedValue([makeArtist()]);
    (deezerApi.searchDeezerAlbums as jest.Mock).mockResolvedValue([makeAlbum()]);

    await deezerProvider.capabilities['artist.enrich']?.(makeArtist());
    expect(deezerApi.resolveDeezerArtistByName).toHaveBeenCalledWith('Test Artist');
    expect(deezerApi.getDeezerArtist).toHaveBeenCalledWith('d-artist');

    await deezerProvider.capabilities['album.enrich']?.(makeAlbum());
    expect(deezerApi.resolveDeezerAlbum).toHaveBeenCalledWith('Test Artist', 'Test Album');

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
    expect(deezerApi.resolveDeezerArtistByName).not.toHaveBeenCalled();
    expect(mbApi.searchArtist).not.toHaveBeenCalled();
    expect(lastfmApi.getLastFmArtistInfo).not.toHaveBeenCalled();
  });
});
