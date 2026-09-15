import type { Server } from '@/providers/contracts/Server';
import type { LocalTrack } from './store';

const mockTracks: Partial<LocalTrack>[] = [];

jest.mock('./store', () => ({
  readLocalLibrary: () => ({ tracks: mockTracks, starredIds: [], playlists: [] }),
  addLocalPlaylist: jest.fn(),
  removeLocalPlaylist: jest.fn(),
  setLocalStarred: jest.fn(),
  updateLocalPlaylist: jest.fn(),
}));

import { createLocalAdapter } from './index';

const server = { id: 'local-1', type: 'local', serverUrl: '', username: '', isAuthenticated: true } as Server;

function track(id: string, albumId: string, genres?: string[]): Partial<LocalTrack> {
  return { id, title: id, artist: 'Artist', artistId: 'ar1', albumId, albumTitle: albumId, cover: { kind: 'none' }, duration: '100', streamId: id, localPath: id, genres };
}

beforeEach(() => {
  mockTracks.length = 0;
});

describe('local genres', () => {
  it('lists every genre the imported files are tagged with, once each, in order', async () => {
    mockTracks.push(track('t1', 'al1', ['Rock', 'Indie']), track('t2', 'al2', ['Jazz', 'Rock']), track('t3', 'al2'));

    await expect(createLocalAdapter(server).genres.list()).resolves.toEqual(['Indie', 'Jazz', 'Rock']);
  });

  it("gives an album the genres of all its tracks, not only the first's", async () => {
    mockTracks.push(track('t1', 'al1', ['Rock']), track('t2', 'al1', ['Rock', 'Blues']));

    const [album] = await createLocalAdapter(server).albums.list();

    expect(album.genres).toEqual(['Rock', 'Blues']);
  });
});
