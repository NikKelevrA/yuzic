import { QueryClient } from '@tanstack/react-query';
import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { QueryKeys } from '@/enums/queryKeys';
import { runCatalogSync } from './catalogSync';

const SERVER = 'srv-1';
const provenance = serverProvenance(SERVER);

const album = (nativeId: string, playCount?: number): Album => ({
  localId: makeLocalId('album', provenance, nativeId),
  nativeId,
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  title: nativeId,
  cover: { kind: 'none' },
  artist: {
    localId: makeLocalId('artist', provenance, 'ar1'),
    nativeId: 'ar1',
    externalIds: {},
    name: 'Artist',
    cover: { kind: 'none' },
  },
  releaseType: 'album',
  genres: [],
  songIds: [],
  ...(playCount === undefined ? {} : { serverPlayCount: playCount, serverLastPlayedAt: 1_000 }),
});

function makeApi(over: Partial<Record<string, unknown>> = {}): ApiAdapter {
  return {
    albums: { list: jest.fn(async () => [album('al1')]), get: jest.fn() },
    artists: { list: jest.fn(async () => []), get: jest.fn() },
    playlists: { list: jest.fn(async () => []), get: jest.fn() },
    tracks: { list: jest.fn(async () => [] as Song[]), get: jest.fn() },
    starred: { list: jest.fn(async () => ({ songs: [], albums: [] })), add: jest.fn(), remove: jest.fn() },
    genres: { list: jest.fn(async () => ['Rock']) },
    ...over,
  } as unknown as ApiAdapter;
}

/**
 * A client per test, torn down afterwards.
 *
 * An un-cleared QueryClient keeps its garbage-collection timers alive, which
 * holds the jest process open after the run finishes — harmless in CI, but it
 * leaves a worker spinning locally.
 */
const clients: QueryClient[] = [];
const client = () => {
  const created = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(created);
  return created;
};

afterEach(() => {
  clients.splice(0).forEach(created => {
    created.clear();
    created.unmount();
  });
});

describe('runCatalogSync', () => {
  it('writes each resource into the cache entry the screens already read', async () => {
    const queryClient = client();

    await runCatalogSync({ queryClient, api: makeApi(), serverId: SERVER, force: true });

    // The sync is the screens' own fetch performed early — not a pipeline
    // feeding some other store.
    expect(queryClient.getQueryData([QueryKeys.Albums, SERVER])).toHaveLength(1);
    expect(queryClient.getQueryData([QueryKeys.Genres, SERVER])).toEqual(['Rock']);
  });

  it('keeps going when one resource fails, and names the one that did', async () => {
    const queryClient = client();
    const api = makeApi({ genres: { list: jest.fn(async () => { throw new Error('down'); }) } });

    const result = await runCatalogSync({ queryClient, api, serverId: SERVER, force: true });

    expect(result.failed).toEqual(['genres']);
    expect(queryClient.getQueryData([QueryKeys.Albums, SERVER])).toHaveLength(1);
    expect(result.hasData).toBe(true);
  });

  it('falls back to an earlier cached copy when a resource fails', async () => {
    const queryClient = client();
    queryClient.setQueryData([QueryKeys.Genres, SERVER], ['Jazz']);
    const api = makeApi({ genres: { list: jest.fn(async () => { throw new Error('down'); }) } });

    const result = await runCatalogSync({ queryClient, api, serverId: SERVER, force: true });

    expect(result.genres).toEqual(['Jazz']);
  });

  it('reports no stats when the origin does not report play counts', async () => {
    // An empty stats list is almost never "nobody has played anything" — it is
    // "this origin does not report them". The caller must be able to tell,
    // because the action it feeds replaces a server's whole stats namespace.
    const result = await runCatalogSync({
      queryClient: client(), api: makeApi(), serverId: SERVER, force: true,
    });

    expect(result.albumStats).toEqual([]);
  });

  it('reports stats for the entities that do carry a count', async () => {
    const api = makeApi({ albums: { list: jest.fn(async () => [album('al1', 7), album('al2')]) } });

    const result = await runCatalogSync({ queryClient: client(), api, serverId: SERVER, force: true });

    expect(result.albumStats).toEqual([{ id: 'al1', playCount: 7, lastPlayedAt: 1_000 }]);
  });

  it('reports hasData false when the server has nothing at all', async () => {
    const api = makeApi({
      albums: { list: jest.fn(async () => []) },
      genres: { list: jest.fn(async () => []) },
    });

    const result = await runCatalogSync({ queryClient: client(), api, serverId: SERVER, force: true });

    expect(result.hasData).toBe(false);
  });
});
