import { deezerClient, DeezerApiError } from './client';

const mockFetch = jest.fn();
jest.mock('@/providers/http/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));

const respond = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });

/**
 * Deezer refuses an over-quota request with 200 OK and an `error` body.
 *
 * Read as a response, that body has no `data`, so the search helpers turned it
 * into an empty list — and cached the empty list for an hour. Typing quickly
 * into "Other sources" spends Deezer's quota in seconds, so a query typed at
 * speed came back empty and stayed empty for that query until the cache
 * expired.
 */
describe('deezerClient.request', () => {
  beforeEach(() => mockFetch.mockReset());

  it('rejects an error body instead of returning it as data', async () => {
    mockFetch.mockReturnValueOnce(respond({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } }));

    const request = deezerClient.request('/search/album?q=x');

    await expect(request).rejects.toBeInstanceOf(DeezerApiError);
    await expect(request).rejects.toMatchObject({ code: 4, message: 'Quota limit exceeded' });
  });

  it('returns a normal body untouched', async () => {
    const body = { data: [{ id: 1 }] };
    mockFetch.mockReturnValueOnce(respond(body));

    await expect(deezerClient.request('/search/album?q=x')).resolves.toEqual(body);
  });

  it('still rejects a non-2xx response', async () => {
    mockFetch.mockReturnValueOnce(respond({}, 503));

    await expect(deezerClient.request('/chart')).rejects.toThrow('Deezer API error (503)');
  });
});
