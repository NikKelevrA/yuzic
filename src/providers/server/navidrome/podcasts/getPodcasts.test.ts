import type { NavidromeClient } from '../client';
import { getPodcasts } from './getPodcasts';

const clientReturning = (channel: unknown[]) =>
  ({ request: jest.fn(async () => ({ 'subsonic-response': { podcasts: { channel } } })) }) as unknown as NavidromeClient;

describe('getPodcasts covers', () => {
  it('serves a channel cover the server holds through its own image id', async () => {
    const [channel] = await getPodcasts(clientReturning([
      { id: 'c1', coverArt: 'pd-c1', episode: [{ id: 'e1', coverArt: 'pd-e1' }] },
    ]));

    expect(channel.cover).toEqual({ kind: 'navidrome', coverArtId: 'pd-c1' });
    expect(channel.episodes[0].cover).toEqual({ kind: 'navidrome', coverArtId: 'pd-e1' });
  });

  it('uses the feed image as a URL, not as a server image id', async () => {
    const [channel] = await getPodcasts(clientReturning([
      { id: 'c1', originalImageUrl: 'https://feed.example/art.jpg' },
    ]));

    expect(channel.cover).toEqual({ kind: 'url', url: 'https://feed.example/art.jpg' });
  });

  it('says there is no cover when neither is given', async () => {
    const [channel] = await getPodcasts(clientReturning([{ id: 'c1', episode: [{ id: 'e1' }] }]));

    expect(channel.cover).toEqual({ kind: 'none' });
    expect(channel.episodes[0].cover).toEqual({ kind: 'none' });
  });
});
