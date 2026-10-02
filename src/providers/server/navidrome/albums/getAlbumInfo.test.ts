import { getAlbumInfo } from './getAlbumInfo';
import type { NavidromeClient } from '../client';

function clientAnswering(response: unknown | Error) {
  const request = jest.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { client: { request } as unknown as NavidromeClient, request };
}

describe('getAlbumInfo', () => {
  it('normalizes a real response', async () => {
    const { client } = clientAnswering({
      'subsonic-response': { albumInfo: { notes: 'Great record.', musicBrainzId: 'rg-1', lastFmUrl: 'https://last.fm/x' } },
    });

    expect(await getAlbumInfo(client, 'al-1')).toEqual({
      notes: 'Great record.',
      musicBrainzId: 'rg-1',
      lastFmUrl: 'https://last.fm/x',
    });
  });

  it("falls back to empty info instead of throwing, for an album the server doesn't recognize", async () => {
    const { client } = clientAnswering(new Error('not found'));

    expect(await getAlbumInfo(client, 'mb-rg-unknown')).toEqual({
      notes: '',
      musicBrainzId: null,
      lastFmUrl: null,
    });
  });
});
