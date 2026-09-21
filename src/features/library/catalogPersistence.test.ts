import { QueryKeys } from '@/state/query/queryKeys';
import { catalogStorage } from '@/state/mmkvStorage';
import {
  clearCatalog,
  compactCatalog,
  isCatalogQuery,
  readCatalogResource,
  writeCatalogResource,
} from './catalogPersistence';

const SERVER = 'srv-1';

beforeEach(() => {
  clearCatalog();
});

describe('isCatalogQuery', () => {
  it.each([
    QueryKeys.Albums,
    QueryKeys.Artists,
    QueryKeys.Playlists,
    QueryKeys.Tracks,
    QueryKeys.Starred,
    QueryKeys.Genres,
  ])('claims %s, so the persister blob never carries it', root => {
    expect(isCatalogQuery([root, SERVER])).toBe(true);
  });

  it.each([
    QueryKeys.Album,
    QueryKeys.Artist,
    QueryKeys.Song,
    QueryKeys.LocalMix,
    QueryKeys.ServerRandom,
  ])('leaves %s to the persister', root => {
    expect(isCatalogQuery([root, SERVER])).toBe(false);
  });

  it('does not claim an empty key', () => {
    expect(isCatalogQuery([])).toBe(false);
  });
});

describe('write and read', () => {
  it('round-trips a resource', () => {
    writeCatalogResource(SERVER, 'albums', [{ nativeId: 'al1' }]);

    expect(readCatalogResource(SERVER, 'albums')).toEqual([{ nativeId: 'al1' }]);
  });

  it('keeps each resource apart, so one sync write cannot cost another', () => {
    writeCatalogResource(SERVER, 'albums', ['a']);
    writeCatalogResource(SERVER, 'tracks', ['t']);

    expect(readCatalogResource(SERVER, 'albums')).toEqual(['a']);
    expect(readCatalogResource(SERVER, 'tracks')).toEqual(['t']);
  });

  it('keeps each server apart', () => {
    writeCatalogResource(SERVER, 'albums', ['mine']);
    writeCatalogResource('srv-2', 'albums', ['theirs']);

    expect(readCatalogResource(SERVER, 'albums')).toEqual(['mine']);
    expect(readCatalogResource('srv-2', 'albums')).toEqual(['theirs']);
  });

  it('reads undefined for a resource never written, rather than an empty list', () => {
    // The difference decides whether a screen asks the server or renders an
    // empty library.
    expect(readCatalogResource(SERVER, 'tracks')).toBeUndefined();
  });

  it('reads undefined for a corrupt record instead of throwing into the caller', () => {
    catalogStorage.set(`${SERVER}:tracks`, '{ not json');

    expect(readCatalogResource(SERVER, 'tracks')).toBeUndefined();
  });

  it('survives a storage that refuses the write', () => {
    const set = jest.spyOn(catalogStorage, 'set').mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(() => writeCatalogResource(SERVER, 'tracks', ['t'])).not.toThrow();

    set.mockRestore();
  });
});

describe('clearCatalog', () => {
  it('drops every server, so signing out does not leave a library behind', () => {
    writeCatalogResource(SERVER, 'albums', ['mine']);
    writeCatalogResource('srv-2', 'tracks', ['theirs']);

    clearCatalog();

    expect(readCatalogResource(SERVER, 'albums')).toBeUndefined();
    expect(readCatalogResource('srv-2', 'tracks')).toBeUndefined();
  });
});

describe('compactCatalog', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trims the store, which is what reclaims the space', () => {
    const trim = jest.spyOn(catalogStorage, 'trim');

    compactCatalog();

    expect(trim).toHaveBeenCalledTimes(1);
  });

  it('leaves every record readable, so compacting a live catalog is safe', () => {
    writeCatalogResource(SERVER, 'albums', [{ nativeId: 'al1' }]);
    writeCatalogResource(SERVER, 'tracks', [{ nativeId: 'tr1' }]);

    compactCatalog();

    expect(readCatalogResource(SERVER, 'albums')).toEqual([{ nativeId: 'al1' }]);
    expect(readCatalogResource(SERVER, 'tracks')).toEqual([{ nativeId: 'tr1' }]);
  });

  it('survives a store that will not trim, because compaction is never worth a crash', () => {
    jest.spyOn(catalogStorage, 'trim').mockImplementation(() => {
      throw new Error('no space to rewrite into');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => compactCatalog()).not.toThrow();
  });
});

describe('chunked storage', () => {
  const tracks = (count: number, tag = 't') =>
    Array.from({ length: count }, (_, index) => ({ nativeId: `${tag}${index}` }));

  /** Every key the store holds for one resource on one server. */
  const keysFor = (server: string, name: string) =>
    catalogStorage.getAllKeys().filter(key => key === `${server}:${name}` || key.startsWith(`${server}:${name}@`));

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads back a list that spans several chunks, in order', () => {
    const list = tracks(12_345);

    writeCatalogResource(SERVER, 'tracks', list);

    expect(readCatalogResource(SERVER, 'tracks')).toEqual(list);
  });

  it('never stores a large list as one record', () => {
    // The property the format exists for: no read or write ever handles the
    // whole library as a single string.
    const list = tracks(12_345);
    writeCatalogResource(SERVER, 'tracks', list);

    const chunks = keysFor(SERVER, 'tracks').filter(key => !key.endsWith('@head'));
    expect(chunks.length).toBeGreaterThan(1);
    for (const key of chunks) {
      expect((JSON.parse(catalogStorage.getString(key)!) as unknown[]).length).toBeLessThan(list.length);
    }
  });

  it('keeps an empty list empty, rather than reading it as missing', () => {
    writeCatalogResource(SERVER, 'playlists', []);

    expect(readCatalogResource(SERVER, 'playlists')).toEqual([]);
  });

  it('keeps a value that is not a list exactly as it was', () => {
    const starred = { songs: [{ nativeId: 's1' }], albums: [] };

    writeCatalogResource(SERVER, 'starred', starred);

    expect(readCatalogResource(SERVER, 'starred')).toEqual(starred);
  });

  it('still reads a record written before chunking existed', () => {
    const list = tracks(3);
    catalogStorage.set(`${SERVER}:tracks`, JSON.stringify(list));

    expect(readCatalogResource(SERVER, 'tracks')).toEqual(list);
  });

  it('removes the pre-chunking record once it has written the new one', () => {
    catalogStorage.set(`${SERVER}:tracks`, JSON.stringify(tracks(3, 'old')));

    writeCatalogResource(SERVER, 'tracks', tracks(2, 'new'));

    expect(catalogStorage.contains(`${SERVER}:tracks`)).toBe(false);
    expect(readCatalogResource(SERVER, 'tracks')).toEqual(tracks(2, 'new'));
  });

  it('leaves no chunks behind when a list shrinks', () => {
    writeCatalogResource(SERVER, 'tracks', tracks(12_345));
    writeCatalogResource(SERVER, 'tracks', tracks(10));

    // The head, and the one chunk ten tracks fit in.
    expect(keysFor(SERVER, 'tracks')).toHaveLength(2);
    expect(readCatalogResource(SERVER, 'tracks')).toEqual(tracks(10));
  });

  it('keeps the previous copy when a write dies before the head moves', () => {
    const before = tracks(12_345, 'before');
    writeCatalogResource(SERVER, 'tracks', before);

    // A process killed mid-sync: every new chunk lands, the head never does.
    const set = catalogStorage.set.bind(catalogStorage);
    jest.spyOn(catalogStorage, 'set').mockImplementation((key, value) => {
      if (key.endsWith('@head')) throw new Error('killed');
      set(key, value);
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    writeCatalogResource(SERVER, 'tracks', tracks(7_000, 'after'));

    expect(readCatalogResource(SERVER, 'tracks')).toEqual(before);
  });

  it('clears what a dead write left behind on the next write that completes', () => {
    writeCatalogResource(SERVER, 'tracks', tracks(10));
    const set = catalogStorage.set.bind(catalogStorage);
    const failing = jest.spyOn(catalogStorage, 'set').mockImplementation((key, value) => {
      if (key.endsWith('@head')) throw new Error('killed');
      set(key, value);
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    writeCatalogResource(SERVER, 'tracks', tracks(12_345, 'orphan'));
    failing.mockRestore();

    writeCatalogResource(SERVER, 'tracks', tracks(10, 'final'));

    expect(keysFor(SERVER, 'tracks')).toHaveLength(2);
    expect(readCatalogResource(SERVER, 'tracks')).toEqual(tracks(10, 'final'));
  });

  it('reads a store with a chunk missing as nothing, not as a shorter library', () => {
    writeCatalogResource(SERVER, 'tracks', tracks(12_345));
    const chunk = keysFor(SERVER, 'tracks').find(key => key.endsWith('#1'))!;
    catalogStorage.remove(chunk);

    expect(readCatalogResource(SERVER, 'tracks')).toBeUndefined();
  });

  it('keeps each server and each resource to its own keys', () => {
    writeCatalogResource(SERVER, 'tracks', tracks(6_000, 'a'));
    writeCatalogResource('srv-2', 'tracks', tracks(6_000, 'b'));
    writeCatalogResource(SERVER, 'albums', tracks(3, 'al'));

    writeCatalogResource(SERVER, 'tracks', tracks(2, 'a2'));

    expect(readCatalogResource('srv-2', 'tracks')).toEqual(tracks(6_000, 'b'));
    expect(readCatalogResource(SERVER, 'albums')).toEqual(tracks(3, 'al'));
    expect(readCatalogResource(SERVER, 'tracks')).toEqual(tracks(2, 'a2'));
  });
});
