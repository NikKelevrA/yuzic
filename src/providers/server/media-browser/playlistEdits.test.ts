import type { Server } from '@/providers/contracts/Server';
import { PlaylistChangedError } from '@/providers/contracts/ServerAdapter';

const mockEntries = jest.fn();
const mockMove = jest.fn();
const mockRemove = jest.fn();

jest.mock('./playlists/getPlaylistItems', () => ({
  getPlaylistItems: jest.fn(),
  getPlaylistEntries: (...args: unknown[]) => mockEntries(...args),
}));
jest.mock('./playlists/movePlaylistItem', () => ({
  movePlaylistItem: (...args: unknown[]) => mockMove(...args),
}));
jest.mock('./playlists/removePlaylistItems', () => ({
  removePlaylistItems: (...args: unknown[]) => mockRemove(...args),
}));

import { createJellyfinAdapter } from './jellyfin';

const server: Server = {
  id: 'jellyfin-1',
  type: 'jellyfin',
  serverUrl: 'https://media.example',
  username: 'ari',
  auth: { token: 'tok', userId: 'user-1' },
  isAuthenticated: true,
};

beforeEach(() => {
  mockEntries.mockReset().mockResolvedValue([
    { songId: 'a', entryId: 'e1' },
    { songId: 'b', entryId: 'e2' },
    { songId: 'a', entryId: 'e3' },
  ]);
  mockMove.mockReset();
  mockRemove.mockReset();
});

describe('Jellyfin and Emby playlist edits', () => {
  it('removes the entry at the position, by its entry id', async () => {
    await createJellyfinAdapter(server).playlists.removeSong('p1', 'a', 2);

    expect(mockRemove).toHaveBeenCalledWith(expect.anything(), 'p1', ['e3']);
  });

  it('refuses a remove that could hit either copy of a song', async () => {
    await expect(createJellyfinAdapter(server).playlists.removeSong('p1', 'a')).rejects.toThrow(PlaylistChangedError);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('moves an entry by its entry id to the new index', async () => {
    await createJellyfinAdapter(server).playlists.moveSong('p1', { songId: 'b', from: 1, to: 0 });

    expect(mockMove).toHaveBeenCalledWith(expect.anything(), 'p1', 'e2', 0);
  });
});
