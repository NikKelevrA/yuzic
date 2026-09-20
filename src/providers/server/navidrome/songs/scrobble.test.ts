const mockServerFetch = jest.fn();
jest.mock('@/features/mtls/serverFetch', () => ({
  serverFetch: (...args: unknown[]) => mockServerFetch(...args),
}));

import { scrobble, nowPlaying } from './scrobble';
import { createNavidromeClient, type NavidromeClient } from '../client';

function makeClient() {
  const request = jest.fn().mockResolvedValue({ 'subsonic-response': { status: 'ok' } });
  return { client: { request } as unknown as NavidromeClient, request };
}

describe('scrobble', () => {
  it('dates the listen when it knows when it began', async () => {
    const { client, request } = makeClient();

    await scrobble(client, 'tr-1', 1_760_000_000_000);

    expect(request).toHaveBeenCalledWith('scrobble.view', {
      id: 'tr-1',
      time: 1_760_000_000_000,
      submission: 'true',
    });
  });

  it('sends no time at all when there is no start time, instead of 1 January 1970', async () => {
    // `listenStartedAt` is 0 with no listen in progress, and 0 is a real
    // timestamp to Subsonic: the listen files fifty-odd years in the past,
    // where Navidrome keeps it and both forwarding destinations refuse it
    // (Last.fm takes nothing older than a fortnight). Omitting the parameter
    // hands the stamping to the server, which is what the spec makes it
    // optional for.
    const { client, request } = makeClient();

    for (const startedAt of [0, -1, Number.NaN]) {
      await scrobble(client, 'tr-1', startedAt);
    }

    for (const [, params] of request.mock.calls) {
      expect(params).toEqual({ id: 'tr-1', submission: 'true' });
    }
  });

  it('leaves no trace of `time` in the URL the server is actually sent', async () => {
    // Asserted on the request itself, because "the parameter was not passed"
    // and "the parameter is not in the query string" are only the same claim
    // as long as nothing downstream fills a blank in.
    mockServerFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ 'subsonic-response': { status: 'ok' } }),
      text: async () => JSON.stringify({ 'subsonic-response': { status: 'ok' } }),
    });
    const client = createNavidromeClient({
      serverUrl: 'https://music.example.com',
      username: 'zack',
      password: 'hunter2',
    });

    await scrobble(client, 'tr-1', 0);
    await scrobble(client, 'tr-1', 1_760_000_000_000);

    const [withoutTime, withTime] = mockServerFetch.mock.calls.map(([url]) => new URL(String(url)));
    expect(withoutTime.searchParams.has('time')).toBe(false);
    expect(withoutTime.searchParams.get('submission')).toBe('true');
    expect(withTime.searchParams.get('time')).toBe('1760000000000');
  });
});

describe('now playing', () => {
  it('is the same endpoint, not submitted, and carries no time of its own', async () => {
    const { client, request } = makeClient();

    await nowPlaying(client, 'tr-1');

    expect(request).toHaveBeenCalledWith('scrobble.view', { id: 'tr-1', submission: 'false' });
  });
});
