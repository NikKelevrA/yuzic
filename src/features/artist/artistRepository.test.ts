import { getArtist } from './artistRepository';
import type { ArtistIdentity, ArtistRepositoryDeps } from './artistRepository';
import type { Artist } from '@/domain/entities/Artist';
import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

const SERVER = serverProvenance('srv-1');

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  const nativeId = overrides.nativeId ?? '1';
  return {
    localId: makeLocalId('artist', SERVER, nativeId),
    nativeId,
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

describe('artistRepository.getArtist', () => {
  it('asks exactly one origin (the server) for the base entity', async () => {
    const artist = makeArtist();
    const get = jest.fn().mockResolvedValue(artist);
    const identity: ArtistIdentity = { kind: 'server', nativeId: '1' };
    const deps: ArtistRepositoryDeps = { api: { get }, libraryArtists: [] };

    const result = await getArtist(identity, deps);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('1');
    expect(result).toEqual(artist);
  });

  it('returns the matched library artist instead of the freshly-fetched one — one canonical entity', async () => {
    const fetched = makeArtist({ nativeId: '1', externalIds: { mbid: 'abc' } });
    const libraryArtist = makeArtist({
      nativeId: '999',
      localId: makeLocalId('artist', SERVER, '999'),
      externalIds: { mbid: 'abc' },
    });
    const get = jest.fn().mockResolvedValue(fetched);

    const result = await getArtist(
      { kind: 'server', nativeId: '1' },
      { api: { get }, libraryArtists: [libraryArtist] }
    );

    expect(result).toBe(libraryArtist);
  });

  it('falls back to the fetched record when nothing in the library matches', async () => {
    const fetched = makeArtist();
    const get = jest.fn().mockResolvedValue(fetched);

    const result = await getArtist(
      { kind: 'server', nativeId: '1' },
      { api: { get }, libraryArtists: [] }
    );

    expect(result).toBe(fetched);
  });
});
