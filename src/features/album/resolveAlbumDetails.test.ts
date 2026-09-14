import { resolveAlbumDetails } from './resolveAlbumDetails';
import type { ResolveAlbumDetailsInput, ResolvedAlbum } from './resolveAlbumDetails';
import type { Album } from '@/domain/entities/Album';
import type { Provider } from '@/providers/contracts/Provider';
import type { BrokerInput } from '@/providers/registry/capabilityBroker';
import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

const SERVER = serverProvenance('srv-1');

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    localId: makeLocalId('album', SERVER, 'a1'),
    nativeId: 'a1',
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

function provider(id: string, invoke: jest.Mock): Provider {
  return {
    kind: 'integration',
    id,
    presentation: { nameKey: `provider.${id}`, icon: 0 },
    auth: { tier: 'none' },
    capabilities: { 'album.enrich': invoke },
    testConnection: async () => ({ ok: true }),
  };
}

function broker(providers: Provider[], order?: string[]): BrokerInput {
  return { providers, isConnected: () => true, isAllowed: () => true, order };
}

describe('resolveAlbumDetails', () => {
  it('zero provider calls when the origin already has a cover — origin wins over any integration', async () => {
    const album = makeAlbum({ cover: { kind: 'url', url: 'server-cover.jpg' } });
    const invoke = jest.fn();
    const input: ResolveAlbumDetailsInput = { album, broker: broker([provider('musicbrainz', invoke)]) };

    const result: ResolvedAlbum = await resolveAlbumDetails(input);

    expect(invoke).not.toHaveBeenCalled();
    expect(result.cover).toEqual({ value: { kind: 'url', url: 'server-cover.jpg' }, sourceId: 'srv-1' });
  });

  it('zero calls when the capability is disabled', async () => {
    const album = makeAlbum();
    const invoke = jest.fn();
    const brokerInput = broker([provider('musicbrainz', invoke)]);
    brokerInput.isAllowed = () => false;

    const result = await resolveAlbumDetails({ album, broker: brokerInput });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.cover).toEqual({ value: { kind: 'none' }, sourceId: 'srv-1' });
  });

  it('fills a missing cover from the first enabled offer that has one, attributed to it', async () => {
    const album = makeAlbum();
    const invoke = jest.fn().mockResolvedValue({
      cover: { kind: 'coverartarchive', mbid: 'rg-1', mbidType: 'release-group' },
    });

    const result = await resolveAlbumDetails({ album, broker: broker([provider('musicbrainz', invoke)]) });

    expect(result.cover).toEqual({
      value: { kind: 'coverartarchive', mbid: 'rg-1', mbidType: 'release-group' },
      sourceId: 'musicbrainz',
    });
  });

  it('zero calls to later providers after a hit', async () => {
    const album = makeAlbum();
    const first = jest.fn().mockResolvedValue({ cover: { kind: 'url', url: 'x' } });
    const second = jest.fn();

    await resolveAlbumDetails({
      album,
      broker: broker([provider('deezer', first), provider('musicbrainz', second)], ['deezer', 'musicbrainz']),
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('honors the user order — a later-preferred provider is skipped once an earlier one hits', async () => {
    const album = makeAlbum();
    const musicbrainz = jest.fn().mockResolvedValue({
      cover: { kind: 'coverartarchive', mbid: 'rg-1', mbidType: 'release-group' },
    });
    const deezer = jest.fn().mockResolvedValue({ cover: { kind: 'url', url: 'deezer.jpg' } });

    const result = await resolveAlbumDetails({
      album,
      broker: broker([provider('deezer', deezer), provider('musicbrainz', musicbrainz)], ['musicbrainz', 'deezer']),
    });

    expect(musicbrainz).toHaveBeenCalledTimes(1);
    expect(deezer).not.toHaveBeenCalled();
    expect(result.cover.sourceId).toBe('musicbrainz');
  });

  it('falls through to the next offer when the first misses', async () => {
    const album = makeAlbum();
    const first = jest.fn().mockResolvedValue(null);
    const second = jest.fn().mockResolvedValue({ cover: { kind: 'url', url: 'x' } });

    const result = await resolveAlbumDetails({
      album,
      broker: broker([provider('musicbrainz', first), provider('deezer', second)], ['musicbrainz', 'deezer']),
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(result.cover.sourceId).toBe('deezer');
  });

  it('never writes anything onto the album entity', async () => {
    const album = makeAlbum();
    const invoke = jest.fn().mockResolvedValue({ cover: { kind: 'url', url: 'x' } });
    const snapshot = JSON.parse(JSON.stringify(album));

    const result = await resolveAlbumDetails({ album, broker: broker([provider('musicbrainz', invoke)]) });

    expect(album).toEqual(snapshot);
    expect(result.entity).toBe(album);
  });
});
