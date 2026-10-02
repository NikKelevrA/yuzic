import { getArtistAlbums } from './getArtistAlbums';
import type { NavidromeClient } from '../client';
import { serverProvenance } from '@/domain/identity/Provenance';

const provenance = serverProvenance('srv-1');

function clientAnswering(responses: Record<string, unknown | Error>) {
  const request = jest.fn(async (view: string) => {
    const answer = responses[view];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { client: { request } as unknown as NavidromeClient, request };
}

describe('getArtistAlbums', () => {
  it("maps getArtist.view's embedded album list, the ID3 shape search3 shares", async () => {
    const { client, request } = clientAnswering({
      'getArtist.view': {
        'subsonic-response': {
          artist: {
            id: 'mb-artist-123',
            name: 'Eminem',
            album: [
              { id: 'mb-rg-abc', name: 'The Slim Shady LP', artist: 'Eminem', artistId: 'mb-artist-123', year: 1999 },
              { id: 'mb-rg-def', name: 'The Eminem Show', artist: 'Eminem', artistId: 'mb-artist-123', year: 2002 },
            ],
          },
        },
      },
    });

    const albums = await getArtistAlbums(client, 'mb-artist-123', provenance);

    expect(albums.map(a => ({ id: a.nativeId, title: a.title, year: a.year }))).toEqual([
      { id: 'mb-rg-abc', title: 'The Slim Shady LP', year: 1999 },
      { id: 'mb-rg-def', title: 'The Eminem Show', year: 2002 },
    ]);
    expect(request).toHaveBeenCalledWith('getArtist.view', { id: 'mb-artist-123' });
  });

  it('returns nothing for an artist with no embedded releases, rather than throwing', async () => {
    const { client } = clientAnswering({
      'getArtist.view': { 'subsonic-response': { artist: { id: 'ar-1', name: 'Bibio' } } },
    });

    expect(await getArtistAlbums(client, 'ar-1', provenance)).toEqual([]);
  });

  it('returns nothing when the server has no such artist at all', async () => {
    const { client } = clientAnswering({ 'getArtist.view': { 'subsonic-response': {} } });

    expect(await getArtistAlbums(client, 'missing', provenance)).toEqual([]);
  });
});
