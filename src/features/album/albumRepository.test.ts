import { getAlbum } from './albumRepository';
import type { AlbumIdentity, AlbumRepositoryDeps } from './albumRepository';
import type { Album } from '@/domain/entities/Album';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { Provider } from '@/providers/contracts/Provider';
import type { BrokerInput } from '@/providers/registry/capabilityBroker';
import { serverProvenance, integrationProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

const SERVER = serverProvenance('srv-1');

function makeAlbum(overrides: Partial<Album> = {}): Album {
  const nativeId = overrides.nativeId ?? 'a1';
  return {
    localId: makeLocalId('album', SERVER, nativeId),
    nativeId,
    provenance: SERVER,
    externalIds: {},
    libraryState: 'in-library',
    title: 'OK Computer',
    cover: { kind: 'none' },
    artist: {
      localId: makeLocalId('artist', SERVER, 'ar1'),
      nativeId: 'ar1',
      externalIds: {},
      name: 'Radiohead',
      cover: { kind: 'none' },
    },
    releaseType: 'album',
    genres: [],
    songIds: [],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<Album> = {}): AlbumDetail {
  return { album: makeAlbum(overrides), songs: [] };
}

function provider(id: string, invoke: jest.Mock): Provider {
  return {
    kind: 'integration',
    id,
    presentation: { nameKey: `provider.${id}`, icon: 0 },
    auth: { tier: 'none' },
    capabilities: { 'catalogue.album': invoke },
    testConnection: async () => ({ ok: true }),
  };
}

describe('albumRepository.getAlbum', () => {
  describe('server identity', () => {
    it('asks exactly one origin (the server) for the base entity', async () => {
      const detail = makeDetail();
      const get = jest.fn().mockResolvedValue(detail);
      const identity: AlbumIdentity = { kind: 'server', nativeId: 'a1' };
      const deps: AlbumRepositoryDeps = { api: { get }, libraryAlbums: [] };

      const result = await getAlbum(identity, deps);

      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith('a1');
      expect(result).toEqual(detail);
    });
  });

  describe('catalogue identity', () => {
    it('asks exactly one broker offer (never every integration) for the base entity', async () => {
      const detail = makeDetail({ provenance: integrationProvenance('musicbrainz') });
      const mbInvoke = jest.fn().mockResolvedValue(detail);
      const deezerInvoke = jest.fn();
      const broker: BrokerInput = {
        providers: [provider('musicbrainz', mbInvoke), provider('deezer', deezerInvoke)],
        isConnected: () => true,
        isAllowed: () => true,
        order: ['musicbrainz', 'deezer'],
      };
      const get = jest.fn();

      const result = await getAlbum(
        { kind: 'catalogue', nativeId: 'rg-1' },
        { api: { get }, broker, libraryAlbums: [] }
      );

      expect(get).not.toHaveBeenCalled();
      expect(mbInvoke).toHaveBeenCalledTimes(1);
      expect(mbInvoke).toHaveBeenCalledWith('rg-1');
      expect(deezerInvoke).not.toHaveBeenCalled();
      expect(result).toEqual(detail);
    });

    it('throws rather than fetching when no catalogue.album provider is available', async () => {
      const broker: BrokerInput = { providers: [], isConnected: () => true, isAllowed: () => true };

      await expect(
        getAlbum({ kind: 'catalogue', nativeId: 'rg-1' }, { api: { get: jest.fn() }, broker, libraryAlbums: [] })
      ).rejects.toThrow();
    });
  });

  describe('library matching', () => {
    it('returns the matched library album as the entity, keeping the freshly-fetched track list', async () => {
      const songs = [{ localId: 'song-1' }] as unknown as AlbumDetail['songs'];
      const fetched: AlbumDetail = { album: makeAlbum({ externalIds: { mbid: 'shared' } }), songs };
      const libraryAlbum = makeAlbum({ nativeId: 'lib-1', localId: makeLocalId('album', SERVER, 'lib-1'), externalIds: { mbid: 'shared' } });
      const get = jest.fn().mockResolvedValue(fetched);

      const result = await getAlbum(
        { kind: 'server', nativeId: 'a1' },
        { api: { get }, libraryAlbums: [libraryAlbum] }
      );

      expect(result.album).toBe(libraryAlbum);
      expect(result.songs).toBe(songs);
    });

    it('returns the freshly-fetched detail unchanged when nothing in the library matches', async () => {
      const fetched = makeDetail();
      const get = jest.fn().mockResolvedValue(fetched);

      const result = await getAlbum(
        { kind: 'server', nativeId: 'a1' },
        { api: { get }, libraryAlbums: [] }
      );

      expect(result).toBe(fetched);
    });
  });
});
