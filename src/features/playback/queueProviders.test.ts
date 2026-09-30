import type { Song } from '@/domain/entities/Song';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { AlbumDetail } from '@/domain/entities/Detail';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import {
  resolveQueueFillProvider,
  createNativeSimilarityQueueFillProvider,
  createSimilarityServiceQueueFillProvider,
  createLibraryFallbackProvider,
  type QueueFillProvider,
} from './queueProviders';

/** A similarity service that answers with these item ids. */
const similarityReturning = (itemIds: string[]) => ({ similarTrackIds: jest.fn(async () => itemIds) });

const provenance = serverProvenance('srv-1');

/** Identity as the app would derive it for a track on the active server. */
const idOf = (nativeId: string) => makeLocalId('song', provenance, nativeId);

const song = (
  nativeId: string,
  overrides: Partial<{ albumId: string; artistId: string }> = {}
): Song => ({
  localId: idOf(nativeId),
  nativeId,
  provenance,
  externalIds: {},
  title: nativeId,
  artist: {
    localId: makeLocalId('artist', provenance, overrides.artistId ?? 'artist-1'),
    nativeId: overrides.artistId ?? 'artist-1',
    externalIds: {},
    name: 'Artist',
    cover: { kind: 'none' },
  },
  album: {
    localId: makeLocalId('album', provenance, overrides.albumId ?? 'album-1'),
    nativeId: overrides.albumId ?? 'album-1',
    externalIds: {},
    title: 'Album',
    cover: { kind: 'none' },
  },
  cover: { kind: 'none' },
  durationSeconds: 120,
  contentKind: 'song',
  genres: [],
});

const artistRefOf = (nativeId: string) => ({
  localId: makeLocalId('artist', provenance, nativeId),
  nativeId,
  externalIds: {},
  name: 'Artist',
  cover: { kind: 'none' as const },
});

const album = (nativeId: string): Album => ({
  localId: makeLocalId('album', provenance, nativeId),
  nativeId,
  provenance,
  externalIds: {},
  title: nativeId,
  cover: { kind: 'none' },
  artist: artistRefOf('artist-1'),
  releaseType: 'album',
  genres: [],
  songIds: [],
});

const albumDetail = (nativeId: string, songs: Song[]): AlbumDetail => ({
  album: album(nativeId),
  songs,
});

const artist = (nativeId: string, albumIds: string[]): Artist => ({
  localId: makeLocalId('artist', provenance, nativeId),
  nativeId,
  provenance,
  externalIds: {},
  name: 'Artist',
  cover: { kind: 'none' },
  tags: [],
  albumIds: albumIds.map(id => makeLocalId('album', provenance, id)),
});

function fakeApi(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    auth: { connect: jest.fn(), ping: jest.fn(), startScan: jest.fn(), disconnect: jest.fn() },
    albums: { list: jest.fn(), get: jest.fn() },
    artists: { list: jest.fn(), get: jest.fn() },
    genres: { list: jest.fn() },
    playlists: { list: jest.fn(), get: jest.fn(), create: jest.fn(), rename: jest.fn(), addSong: jest.fn(), removeSong: jest.fn(), moveSong: jest.fn(), delete: jest.fn() },
    starred: { list: jest.fn(), add: jest.fn(), remove: jest.fn() },
    songs: { get: jest.fn(async () => null), scrobble: jest.fn(), buildStreamUrl: jest.fn() },
    tracks: { list: jest.fn(), get: jest.fn() },
    similar: { getSimilarSongs: jest.fn(async () => []) },
    lyrics: { getBySongId: jest.fn() },
    search: { search: jest.fn() },
    ...overrides,
  } as ApiAdapter;
}

describe('resolveQueueFillProvider', () => {
  const provider = (id: QueueFillProvider['id'], available: boolean): QueueFillProvider => ({
    id,
    isAvailable: () => available,
    fetchExtension: jest.fn(async () => []),
  });

  it('returns the first available provider in priority order', () => {
    const similarity = provider('similarity-service', true);
    const native = provider('native-similarity', true);
    expect(resolveQueueFillProvider([similarity, native])).toBe(similarity);
  });

  it('skips unavailable providers', () => {
    const similarity = provider('similarity-service', false);
    const native = provider('native-similarity', true);
    expect(resolveQueueFillProvider([similarity, native])).toBe(native);
  });

  it('returns null when no provider is available', () => {
    expect(resolveQueueFillProvider([provider('similarity-service', false)])).toBeNull();
  });
});

describe('createNativeSimilarityQueueFillProvider', () => {
  it('is always available', () => {
    const provider = createNativeSimilarityQueueFillProvider(fakeApi());
    expect(provider.isAvailable()).toBe(true);
  });

  it('returns nothing when there are no seed songs', async () => {
    const provider = createNativeSimilarityQueueFillProvider(fakeApi());
    const result = await provider.fetchExtension({ recentSongs: [], excludeIds: new Set(), count: 10 });
    expect(result).toEqual([]);
  });

  it('seeds from the last recent song and excludes already-queued ids', async () => {
    const getSimilarSongs = jest.fn(async () => [song('a'), song('b'), song('c')]);
    const api = fakeApi({ similar: { getSimilarSongs } });
    const provider = createNativeSimilarityQueueFillProvider(api);

    const result = await provider.fetchExtension({
      recentSongs: [song('x'), song('seed')],
      excludeIds: new Set([idOf('b')]),
      count: 10,
    });

    // The seed goes to the server, so it is the native id.
    expect(getSimilarSongs).toHaveBeenCalledWith('seed');
    expect(result.map(s => s.nativeId).sort()).toEqual(['a', 'c']);
  });

  it('caps the result at count', async () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(song);
    const api = fakeApi({ similar: { getSimilarSongs: jest.fn(async () => many) } });
    const provider = createNativeSimilarityQueueFillProvider(api);

    const result = await provider.fetchExtension({ recentSongs: [song('seed')], excludeIds: new Set(), count: 2 });
    expect(result.length).toBe(2);
  });
});

describe('createSimilarityServiceQueueFillProvider', () => {
  it('is available whenever a service was handed to it', () => {
    expect(createSimilarityServiceQueueFillProvider(similarityReturning([]), fakeApi()).isAvailable()).toBe(true);
  });

  it('resolves similarity refs to library songs, dropping unresolvable and excluded ones', async () => {
    const similarity = similarityReturning(['a', 'b', 'missing']);
    const get = jest.fn(async (id: string) => (id === 'missing' ? null : song(id)));
    const api = fakeApi({ songs: { get, scrobble: jest.fn(), buildStreamUrl: jest.fn(), streamableCodecs: ['mp3'], scrobbleKind: 'scrobble' as const } });
    const provider = createSimilarityServiceQueueFillProvider(similarity, api);

    const result = await provider.fetchExtension({
      recentSongs: [song('seed')],
      excludeIds: new Set([idOf('b')]),
      count: 10,
    });

    expect(result.map(s => s.nativeId)).toEqual(['a']);
  });

  it('sends the service native item ids to exclude, not on-device identities', async () => {
    // The service only knows the media server's own item ids. Passing the
    // identity strings straight through would exclude nothing, because none of
    // them would match anything it holds.
    const similarity = similarityReturning(['a']);
    const get = jest.fn(async (id: string) => song(id));
    const api = fakeApi({ songs: { get, scrobble: jest.fn(), buildStreamUrl: jest.fn(), streamableCodecs: ['mp3'], scrobbleKind: 'scrobble' as const } });
    const provider = createSimilarityServiceQueueFillProvider(similarity, api);

    await provider.fetchExtension({
      recentSongs: [song('seed')],
      excludeIds: new Set([idOf('b'), idOf('c')]),
      count: 10,
    });

    expect(similarity.similarTrackIds).toHaveBeenCalledWith(
      expect.objectContaining({ seedItemIds: ['seed'], excludeItemIds: ['b', 'c'] })
    );
  });

  it('requests a larger candidate pool than count and samples down, so repeat plays of the same seed vary', async () => {
    const similarity = similarityReturning(['a', 'b', 'c', 'd', 'e']);
    const get = jest.fn(async (id: string) => song(id));
    const api = fakeApi({ songs: { get, scrobble: jest.fn(), buildStreamUrl: jest.fn(), streamableCodecs: ['mp3'], scrobbleKind: 'scrobble' as const } });
    const provider = createSimilarityServiceQueueFillProvider(similarity, api);

    const result = await provider.fetchExtension({
      recentSongs: [song('seed')],
      excludeIds: new Set(),
      count: 3,
    });

    const [opts] = similarity.similarTrackIds.mock.calls[0] as unknown as [{ limit: number }];
    expect(opts.limit).toBeGreaterThan(3);
    expect(result.length).toBe(3);
  });
});

describe('createLibraryFallbackProvider', () => {
  it('is always available', () => {
    expect(createLibraryFallbackProvider(fakeApi()).isAvailable()).toBe(true);
  });

  it('returns nothing when there are no seed songs', async () => {
    const provider = createLibraryFallbackProvider(fakeApi());
    const result = await provider.fetchExtension({ recentSongs: [], excludeIds: new Set(), count: 10 });
    expect(result).toEqual([]);
  });

  it('returns nothing when the seed itself cannot be resolved', async () => {
    const api = fakeApi({ songs: { get: jest.fn(async () => null), scrobble: jest.fn(), buildStreamUrl: jest.fn() } });
    const provider = createLibraryFallbackProvider(api);

    const result = await provider.fetchExtension({ recentSongs: [{ nativeId: 'gone' }], excludeIds: new Set(), count: 10 });
    expect(result).toEqual([]);
  });

  it('falls back to the rest of the seed\'s own album, in album order, unshuffled', async () => {
    const seed = song('seed', { albumId: 'al1' });
    const albumSongs = ['seed', 'b', 'c'].map(id => song(id, { albumId: 'al1' }));
    const api = fakeApi({
      songs: { get: jest.fn(async () => seed), scrobble: jest.fn(), buildStreamUrl: jest.fn() },
      albums: { list: jest.fn(), get: jest.fn(async () => albumDetail('al1', albumSongs)) },
    });
    const provider = createLibraryFallbackProvider(api);

    const result = await provider.fetchExtension({
      recentSongs: [{ nativeId: 'seed' }],
      excludeIds: new Set([idOf('seed')]),
      count: 10,
    });

    expect(api.albums.get).toHaveBeenCalledWith('al1');
    expect(result.map(s => s.nativeId)).toEqual(['b', 'c']);
  });

  it('caps the album fallback at count', async () => {
    const seed = song('seed', { albumId: 'al1' });
    const albumSongs = ['b', 'c', 'd', 'e'].map(id => song(id, { albumId: 'al1' }));
    const api = fakeApi({
      songs: { get: jest.fn(async () => seed), scrobble: jest.fn(), buildStreamUrl: jest.fn() },
      albums: { list: jest.fn(), get: jest.fn(async () => albumDetail('al1', albumSongs)) },
    });
    const provider = createLibraryFallbackProvider(api);

    const result = await provider.fetchExtension({ recentSongs: [{ nativeId: 'seed' }], excludeIds: new Set(), count: 2 });
    expect(result.length).toBe(2);
  });

  it('falls back to another album by the same artist once the seed\'s own album is exhausted', async () => {
    // A single-folder rip is often the whole album — nothing left there once
    // the already-queued tracks are excluded.
    const seed = song('seed', { albumId: 'al1', artistId: 'artist-1' });
    const siblingSongs = ['x', 'y'].map(id => song(id, { albumId: 'al2', artistId: 'artist-1' }));
    const getAlbum = jest.fn(async (id: string) =>
      id === 'al1'
        ? albumDetail('al1', [seed]) // only the seed itself — nothing else to offer
        : albumDetail('al2', siblingSongs));
    const api = fakeApi({
      songs: { get: jest.fn(async () => seed), scrobble: jest.fn(), buildStreamUrl: jest.fn() },
      albums: { list: jest.fn(), get: getAlbum },
      artists: { list: jest.fn(), get: jest.fn(async () => artist('artist-1', ['al1', 'al2'])) },
    });
    const provider = createLibraryFallbackProvider(api);

    const result = await provider.fetchExtension({
      recentSongs: [{ nativeId: 'seed' }],
      excludeIds: new Set([idOf('seed')]),
      count: 10,
    });

    expect(getAlbum).toHaveBeenCalledWith('al2');
    expect(result.map(s => s.nativeId).sort()).toEqual(['x', 'y']);
  });

  it('returns nothing when the seed\'s album is exhausted and the artist has no other album', async () => {
    const seed = song('seed', { albumId: 'al1', artistId: 'artist-1' });
    const api = fakeApi({
      songs: { get: jest.fn(async () => seed), scrobble: jest.fn(), buildStreamUrl: jest.fn() },
      albums: { list: jest.fn(), get: jest.fn(async () => albumDetail('al1', [seed])) },
      artists: { list: jest.fn(), get: jest.fn(async () => artist('artist-1', ['al1'])) },
    });
    const provider = createLibraryFallbackProvider(api);

    const result = await provider.fetchExtension({
      recentSongs: [{ nativeId: 'seed' }],
      excludeIds: new Set([idOf('seed')]),
      count: 10,
    });

    expect(result).toEqual([]);
  });

  it('does not throw when the album or artist lookup fails, treating it as nothing found', async () => {
    const seed = song('seed', { albumId: 'al1' });
    const api = fakeApi({
      songs: { get: jest.fn(async () => seed), scrobble: jest.fn(), buildStreamUrl: jest.fn() },
      albums: { list: jest.fn(), get: jest.fn(async () => { throw new Error('offline'); }) },
      artists: { list: jest.fn(), get: jest.fn(async () => { throw new Error('offline'); }) },
    });
    const provider = createLibraryFallbackProvider(api);

    await expect(provider.fetchExtension({
      recentSongs: [{ nativeId: 'seed' }],
      excludeIds: new Set(),
      count: 10,
    })).resolves.toEqual([]);
  });
});
