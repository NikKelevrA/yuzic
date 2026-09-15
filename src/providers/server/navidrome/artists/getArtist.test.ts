import { getArtist, getArtistWithBiography, plainBiography } from './getArtist';
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

const artistResponse = { 'subsonic-response': { artist: { id: 'ar-1', name: 'Bibio', coverArt: 'ar-1' } } };

describe('Navidrome artist biography', () => {
  it('reads the biography as plain text, without the trailing Last.fm link', () => {
    expect(plainBiography('Stephen Wilkinson, known as <b>Bibio</b>. <a href="https://www.last.fm/music/Bibio">Read more on Last.fm</a>'))
      .toBe('Stephen Wilkinson, known as Bibio.');
    expect(plainBiography('<a href="https://last.fm">Read more on Last.fm</a>')).toBeUndefined();
    expect(plainBiography(undefined)).toBeUndefined();
  });

  it("gives the artist page the server's own biography", async () => {
    const { client } = clientAnswering({
      'getArtist.view': artistResponse,
      'getArtistInfo2.view': { 'subsonic-response': { artistInfo2: { biography: 'An English musician.' } } },
    });

    const artist = await getArtistWithBiography(client, 'ar-1', provenance);

    expect(artist?.biography).toBe('An English musician.');
    expect(artist?.name).toBe('Bibio');
  });

  it('still returns the artist when the server has no biography or the info call fails', async () => {
    const { client } = clientAnswering({ 'getArtist.view': artistResponse, 'getArtistInfo2.view': new Error('boom') });

    const artist = await getArtistWithBiography(client, 'ar-1', provenance);

    expect(artist?.name).toBe('Bibio');
    expect(artist?.biography).toBeUndefined();
  });

  it('asks only for the artist when the caller wants no biography', async () => {
    const { client, request } = clientAnswering({ 'getArtist.view': artistResponse });

    await getArtist(client, 'ar-1', provenance);

    expect(request.mock.calls.map(([view]) => view)).toEqual(['getArtist.view']);
  });
});
