import { resolveArtistDetails } from './resolveArtistDetails';
import type { ResolveArtistDetailsInput, ResolvedArtist } from './resolveArtistDetails';
import type { Artist } from '@/domain/entities/Artist';
import type { Provider } from '@/providers/contracts/Provider';
import type { BrokerInput } from '@/providers/registry/capabilityBroker';
import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

const SERVER = serverProvenance('srv-1');

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    localId: makeLocalId('artist', SERVER, '1'),
    nativeId: '1',
    provenance: SERVER,
    externalIds: {},
    libraryState: 'in-library',
    name: 'Radiohead',
    cover: { kind: 'none' },
    biography: undefined,
    tags: [],
    albumIds: [],
    ...overrides,
  };
}

function provider(id: string, invoke: jest.Mock): Provider {
  return {
    kind: 'integration',
    id,
    presentation: { nameKey: `provider.${id}`, icon: 0 },
    auth: { tier: 'none' },
    capabilities: { 'artist.enrich': invoke },
    testConnection: async () => ({ ok: true }),
  };
}

function broker(providers: Provider[], order?: string[]): BrokerInput {
  return { providers, isConnected: () => true, isAllowed: () => true, order };
}

describe('resolveArtistDetails', () => {
  it('zero provider calls when the origin already answered every field', async () => {
    const artist = makeArtist({ biography: 'A band.', tags: ['rock'] });
    const invoke = jest.fn();
    const input: ResolveArtistDetailsInput = { artist, broker: broker([provider('lastfm', invoke)]) };

    const result: ResolvedArtist = await resolveArtistDetails(input);

    expect(invoke).not.toHaveBeenCalled();
    expect(result.biography).toEqual({ value: 'A band.', sourceId: 'srv-1' });
    expect(result.tags).toEqual({ value: ['rock'], sourceId: 'srv-1' });
  });

  it('asks for tags when the server gave a biography but no tags', async () => {
    const artist = makeArtist({ biography: 'A band.' });
    const invoke = jest.fn().mockResolvedValue({ biography: 'Other bio', tags: ['alt'] });

    const result = await resolveArtistDetails({ artist, broker: broker([provider('lastfm', invoke)]) });

    expect(result.biography).toEqual({ value: 'A band.', sourceId: 'srv-1' });
    expect(result.tags).toEqual({ value: ['alt'], sourceId: 'lastfm' });
  });

  it('zero calls when the capability is disabled for every provider', async () => {
    const artist = makeArtist();
    const invoke = jest.fn();
    const brokerInput = broker([provider('lastfm', invoke)]);
    brokerInput.isAllowed = () => false;

    const result = await resolveArtistDetails({ artist, broker: brokerInput });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.biography).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  it('fills missing fields from the first enabled offer, attributed to it', async () => {
    const artist = makeArtist();
    const invoke = jest.fn().mockResolvedValue({ biography: 'From Last.fm', tags: ['alt'] });

    const result = await resolveArtistDetails({ artist, broker: broker([provider('lastfm', invoke)]) });

    expect(result.biography).toEqual({ value: 'From Last.fm', sourceId: 'lastfm' });
    expect(result.tags).toEqual({ value: ['alt'], sourceId: 'lastfm' });
  });

  it('zero calls to later providers once every missing field is filled', async () => {
    const artist = makeArtist();
    const first = jest.fn().mockResolvedValue({ biography: 'Bio', tags: ['tag'] });
    const second = jest.fn();

    await resolveArtistDetails({
      artist,
      broker: broker([provider('first', first), provider('second', second)], ['first', 'second']),
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('resolves independent fields from different offers — a bio hit does not block later tags', async () => {
    const artist = makeArtist();
    const first = jest.fn().mockResolvedValue({ biography: 'Bio' });
    const second = jest.fn().mockResolvedValue({ tags: ['tag'] });

    const result = await resolveArtistDetails({
      artist,
      broker: broker([provider('first', first), provider('second', second)], ['first', 'second']),
    });

    expect(result.biography).toEqual({ value: 'Bio', sourceId: 'first' });
    expect(result.tags).toEqual({ value: ['tag'], sourceId: 'second' });
  });

  it('never writes anything onto the artist entity — the input object is untouched', async () => {
    const artist = makeArtist();
    const invoke = jest.fn().mockResolvedValue({ biography: 'Bio', tags: ['tag'] });
    const snapshot = JSON.parse(JSON.stringify(artist));

    const result = await resolveArtistDetails({ artist, broker: broker([provider('lastfm', invoke)]) });

    expect(artist).toEqual(snapshot);
    expect(result.entity).toBe(artist);
  });
});
