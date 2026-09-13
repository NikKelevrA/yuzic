/**
 * HTTP-boundary fixture test for `deezerProvider['artist.enrich']`.
 *
 * The correction this locks in: Deezer may supply artist image/details
 * (cover + externalIds) — it is a legitimate artist-image provider, unlike
 * Cover Art Archive (see `src/api/musicbrainz/index.test.ts` and
 * `enrichmentFetchers.test.ts` for that half of the correction).
 */
import { deezerProvider } from './deezer';
import { fetchWithTimeout } from '@/api/fetchWithTimeout';

jest.mock('@/api/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));

const mockedFetch = fetchWithTimeout as jest.Mock;

function jsonResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('deezerProvider artist.enrich', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('supplies artist cover and externalIds via a name resolve + artist fetch', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 42, name: 'Radiohead Fixture' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 42, name: 'Radiohead Fixture', picture_xl: 'https://example.com/big.jpg' })
      );

    const result = await deezerProvider.capabilities['artist.enrich']!(
      { name: 'Radiohead Fixture' } as never
    );

    expect(result).toEqual({
      cover: { kind: 'url', url: 'https://example.com/big.jpg' },
      externalIds: { deezerId: '42' },
    });
  });

  it('returns null without a cover when the name does not resolve to any artist', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    const result = await deezerProvider.capabilities['artist.enrich']!(
      { name: 'Nonexistent Fixture Artist' } as never
    );

    expect(result).toBeNull();
  });
});
