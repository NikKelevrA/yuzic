import { QueryClient } from '@tanstack/react-query';
import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { QueryKeys } from '@/state/query/queryKeys';
import { runCatalogSync } from './catalogSync';
import { clearCatalog, readCatalogResource, writeCatalogResource } from './catalogPersistence';

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

    await runCatalogSync({ queryClient, api: makeApi(), serverId: SERVER });

    // The sync is the screens' own fetch performed early — not a pipeline
    // feeding some other store.
    expect(queryClient.getQueryData([QueryKeys.Albums, SERVER])).toHaveLength(1);
    expect(queryClient.getQueryData([QueryKeys.Genres, SERVER])).toEqual(['Rock']);
  });

  it('asks the server again even when the cache entry is already populated', async () => {
    // The regression that hid newly added music. Each catalog resource is read
    // by screens at `staleTime: Infinity` — right for them, since a mounted
    // screen should render the persisted copy rather than a spinner — and the
    // sync used to pass that same value to `fetchQuery` for any run that
    // wasn't forced. A persisted entry is never stale under it, so app start,
    // foreground and server switch all resolved from the restored cache
    // without a request, and an album added since the last forced sync stayed
    // invisible until someone hit the manual refresh in Settings.
    const queryClient = client();
    queryClient.setQueryData([QueryKeys.Albums, SERVER], [album('before')]);
    const list = jest.fn(async () => [album('before'), album('after')]);

    await runCatalogSync({ queryClient, api: makeApi({ albums: { list } }), serverId: SERVER });

    expect(list).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData([QueryKeys.Albums, SERVER])).toHaveLength(2);
  });

  it('keeps going when one resource fails, and names the one that did', async () => {
    const queryClient = client();
    const api = makeApi({ genres: { list: jest.fn(async () => { throw new Error('down'); }) } });

    const result = await runCatalogSync({ queryClient, api, serverId: SERVER });

    expect(result.failed).toEqual(['genres']);
    expect(queryClient.getQueryData([QueryKeys.Albums, SERVER])).toHaveLength(1);
    expect(result.hasData).toBe(true);
  });

  it('falls back to an earlier cached copy when a resource fails', async () => {
    const queryClient = client();
    queryClient.setQueryData([QueryKeys.Genres, SERVER], ['Jazz']);
    const api = makeApi({ genres: { list: jest.fn(async () => { throw new Error('down'); }) } });

    const result = await runCatalogSync({ queryClient, api, serverId: SERVER });

    expect(result.genres).toEqual(['Jazz']);
  });

  it('reports no stats when the origin does not report play counts', async () => {
    // An empty stats list is almost never "nobody has played anything" — it is
    // "this origin does not report them". The caller must be able to tell,
    // because the action it feeds replaces a server's whole stats namespace.
    const result = await runCatalogSync({
      queryClient: client(), api: makeApi(), serverId: SERVER,
    });

    expect(result.albumStats).toEqual([]);
  });

  it('reports stats for the entities that do carry a count', async () => {
    const api = makeApi({ albums: { list: jest.fn(async () => [album('al1', 7), album('al2')]) } });

    const result = await runCatalogSync({ queryClient: client(), api, serverId: SERVER });

    expect(result.albumStats).toEqual([{ id: 'al1', playCount: 7, lastPlayedAt: 1_000 }]);
  });

  it('reports hasData false when the server has nothing at all', async () => {
    const api = makeApi({
      albums: { list: jest.fn(async () => []) },
      genres: { list: jest.fn(async () => []) },
    });

    const result = await runCatalogSync({ queryClient: client(), api, serverId: SERVER });

    expect(result.hasData).toBe(false);
  });
});

describe('runCatalogSync and the catalog store', () => {
  beforeEach(() => {
    clearCatalog();
  });

  it('stores each resource it fetched, so a cold start has a library to read', async () => {
    await runCatalogSync({ queryClient: client(), api: makeApi(), serverId: SERVER });

    expect(readCatalogResource(SERVER, 'albums')).toEqual([album('al1')]);
    expect(readCatalogResource(SERVER, 'genres')).toEqual(['Rock']);
  });

  it('leaves a failed resource stored as it was, rather than emptying it', async () => {
    // One flaky endpoint must not cost the user their offline library. The
    // previous run's copy is better than nothing, and nothing is what writing
    // the rejection through would leave.
    writeCatalogResource(SERVER, 'tracks', [{ nativeId: 'tr-from-a-good-run' }]);
    const api = makeApi({
      tracks: { list: jest.fn(async () => { throw new Error('502'); }) },
    });

    const result = await runCatalogSync({ queryClient: client(), api, serverId: SERVER });

    expect(result.failed).toContain('tracks');
    expect(readCatalogResource(SERVER, 'tracks')).toEqual([{ nativeId: 'tr-from-a-good-run' }]);
  });

  it('stores the resources that succeeded even when another failed', async () => {
    const api = makeApi({
      tracks: { list: jest.fn(async () => { throw new Error('502'); }) },
    });

    await runCatalogSync({ queryClient: client(), api, serverId: SERVER });

    expect(readCatalogResource(SERVER, 'albums')).toEqual([album('al1')]);
  });

  it('stores an empty list a server really returned, which is not the same as a failure', async () => {
    const api = makeApi({ albums: { list: jest.fn(async () => []) } });

    await runCatalogSync({ queryClient: client(), api, serverId: SERVER });

    expect(readCatalogResource(SERVER, 'albums')).toEqual([]);
  });
});
