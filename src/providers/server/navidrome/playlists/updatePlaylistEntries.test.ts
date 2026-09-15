import { serverProvenance } from '@/domain/identity/Provenance';
import { PlaylistChangedError } from '@/providers/contracts/ServerAdapter';
import type { NavidromeClient } from '../client';
import { movePlaylistEntry, removePlaylistEntry } from './updatePlaylistEntries';

const provenance = serverProvenance('nd');

function clientWith(ids: string[]) {
  const request = jest.fn(async (endpoint: string) => {
    if (endpoint === 'getPlaylist.view') {
      return {
        'subsonic-response': {
          status: 'ok',
          playlist: { id: 'p1', name: 'P', entry: ids.map(id => ({ id, title: id })) },
        },
      };
    }
    return { 'subsonic-response': { status: 'ok' } };
  });
  return { client: { request } as unknown as NavidromeClient, request };
}

const update = (request: jest.Mock) =>
  request.mock.calls.find(([endpoint]) => endpoint === 'updatePlaylist.view')?.[1];

describe('Navidrome playlist entries', () => {
  it('removes the entry at the position asked for, where the song is in twice', async () => {
    const { client, request } = clientWith(['a', 'b', 'a']);

    await removePlaylistEntry(client, provenance, 'p1', 'a', 2);

    expect(update(request)).toEqual({ playlistId: 'p1', songIndexToRemove: [2] });
  });

  it('refuses to guess which copy to remove', async () => {
    const { client, request } = clientWith(['a', 'b', 'a']);

    await expect(removePlaylistEntry(client, provenance, 'p1', 'a')).rejects.toThrow(PlaylistChangedError);
    expect(update(request)).toBeUndefined();
  });

  it('moves an entry down by rewriting only the tail from where the order changes', async () => {
    const { client, request } = clientWith(['a', 'b', 'c', 'd']);

    await movePlaylistEntry(client, provenance, 'p1', { songId: 'b', from: 1, to: 2 });

    expect(update(request)).toEqual({
      playlistId: 'p1',
      songIndexToRemove: [1, 2, 3],
      songIdToAdd: ['c', 'b', 'd'],
    });
  });

  it('moves an entry to the top', async () => {
    const { client, request } = clientWith(['a', 'b', 'c']);

    await movePlaylistEntry(client, provenance, 'p1', { songId: 'c', from: 2, to: 0 });

    expect(update(request)).toEqual({
      playlistId: 'p1',
      songIndexToRemove: [0, 1, 2],
      songIdToAdd: ['c', 'a', 'b'],
    });
  });

  it('sends nothing for a move that changes nothing', async () => {
    const { client, request } = clientWith(['a', 'b']);

    await movePlaylistEntry(client, provenance, 'p1', { songId: 'a', from: 0, to: 0 });

    expect(update(request)).toBeUndefined();
  });
});
