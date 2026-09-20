import { QueryKeys } from '@/state/query/queryKeys';
import { catalogStorage } from '@/state/mmkvStorage';
import {
  clearCatalog,
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
