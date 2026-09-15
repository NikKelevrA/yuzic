import { getPlaylist } from './playlistRepository';
import type { PlaylistIdentity, PlaylistRepositoryDeps } from './playlistRepository';
import type { Playlist } from '@/domain/entities/Playlist';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

const SERVER = serverProvenance('srv-1');

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  const nativeId = overrides.nativeId ?? 'p1';
  return {
    localId: makeLocalId('playlist', SERVER, nativeId),
    nativeId,
    provenance: SERVER,
    externalIds: {},
    libraryState: 'in-library',
    title: 'Road Trip',
    cover: { kind: 'none' },
    isOwned: true,
    songIds: [],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<Playlist> = {}): PlaylistDetail {
  return { playlist: makePlaylist(overrides), songs: [] };
}

describe('playlistRepository.getPlaylist', () => {
  it('asks exactly one origin (the server) for the base entity', async () => {
    const detail = makeDetail();
    const get = jest.fn().mockResolvedValue(detail);
    const identity: PlaylistIdentity = { kind: 'server', nativeId: 'p1' };
    const deps: PlaylistRepositoryDeps = { api: { get }, libraryPlaylists: [] };

    const result = await getPlaylist(identity, deps);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('p1');
    expect(result).toEqual(detail);
  });

  it('returns the matched library playlist as the entity, keeping the freshly-fetched track list', async () => {
    const songs = [{ localId: 'song-1' }] as unknown as PlaylistDetail['songs'];
    const fetched: PlaylistDetail = { playlist: makePlaylist({ title: 'Road Trip' }), songs };
    const libraryPlaylist = makePlaylist({ nativeId: 'lib-1', localId: makeLocalId('playlist', SERVER, 'lib-1'), title: 'Road Trip' });
    const get = jest.fn().mockResolvedValue(fetched);

    const result = await getPlaylist(
      { kind: 'server', nativeId: 'p1' },
      { api: { get }, libraryPlaylists: [libraryPlaylist] }
    );

    expect(result.playlist).toBe(libraryPlaylist);
    expect(result.songs).toBe(songs);
  });

  it('returns the freshly-fetched detail unchanged when nothing in the library matches', async () => {
    const fetched = makeDetail();
    const get = jest.fn().mockResolvedValue(fetched);

    const result = await getPlaylist(
      { kind: 'server', nativeId: 'p1' },
      { api: { get }, libraryPlaylists: [] }
    );

    expect(result).toBe(fetched);
  });
});
