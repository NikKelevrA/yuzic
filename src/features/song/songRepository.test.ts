import { getSong } from './songRepository';
import type { SongIdentity, SongRepositoryDeps } from './songRepository';
import type { Song } from '@/domain/entities/Song';
import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

const SERVER = serverProvenance('srv-1');

function makeSong(overrides: Partial<Song> = {}): Song {
  const nativeId = overrides.nativeId ?? 's1';
  return {
    localId: makeLocalId('song', SERVER, nativeId),
    nativeId,
    provenance: SERVER,
    externalIds: {},
    libraryState: 'in-library',
    title: 'Paranoid Android',
    artist: { localId: makeLocalId('artist', SERVER, 'ar1'), nativeId: 'ar1', externalIds: {}, name: 'Radiohead', cover: { kind: 'none' } },
    album: { localId: makeLocalId('album', SERVER, 'al1'), nativeId: 'al1', externalIds: {}, title: 'OK Computer', cover: { kind: 'none' } },
    cover: { kind: 'none' },
    durationSeconds: 383,
    contentKind: 'song',
    genres: [],
    ...overrides,
  };
}

describe('songRepository.getSong', () => {
  it('asks exactly one origin (the server) for the base entity', async () => {
    const song = makeSong();
    const get = jest.fn().mockResolvedValue(song);
    const identity: SongIdentity = { kind: 'server', nativeId: 's1' };
    const deps: SongRepositoryDeps = { api: { get }, librarySongs: [] };

    const result = await getSong(identity, deps);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('s1');
    expect(result).toEqual(song);
  });

  it('throws when the origin has no such song, rather than returning null silently', async () => {
    const get = jest.fn().mockResolvedValue(null);

    await expect(
      getSong({ kind: 'server', nativeId: 'missing' }, { api: { get }, librarySongs: [] })
    ).rejects.toThrow();
  });

  it('returns the matched library song instead of the freshly-fetched one', async () => {
    const fetched = makeSong({ nativeId: 's1', externalIds: { isrc: 'ISRC1' } });
    const librarySong = makeSong({ nativeId: 'lib-1', localId: makeLocalId('song', SERVER, 'lib-1'), externalIds: { isrc: 'ISRC1' } });
    const get = jest.fn().mockResolvedValue(fetched);

    const result = await getSong(
      { kind: 'server', nativeId: 's1' },
      { api: { get }, librarySongs: [librarySong] }
    );

    expect(result).toBe(librarySong);
  });

  it('falls back to the fetched record when nothing in the library matches', async () => {
    const fetched = makeSong();
    const get = jest.fn().mockResolvedValue(fetched);

    const result = await getSong({ kind: 'server', nativeId: 's1' }, { api: { get }, librarySongs: [] });

    expect(result).toBe(fetched);
  });
});
