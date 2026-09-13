/**
 * HTTP-boundary fixture test for `lastfmProvider['artist.enrich']`.
 *
 * The correction this locks in: Last.fm's artist.getinfo response carries a
 * biography AND a tag list together, and both must be consumed — a resolver
 * that only kept one and silently discarded the other would still pass a
 * bio-only or tags-only fixture, which is why this asserts both fields from
 * one fetch.
 */
import { lastfmProvider } from './lastfm';
import { fetchWithTimeout } from '@/api/fetchWithTimeout';

jest.mock('@/api/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
jest.mock('@/constants/keys', () => ({ LASTFM_API_KEY: 'test-key' }));

const mockedFetch = fetchWithTimeout as jest.Mock;

function jsonResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('lastfmProvider artist.enrich', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('returns both biography and tags from a single artist.getinfo response', async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse({
        artist: {
          bio: { summary: 'An English rock band.' },
          tags: { tag: [{ name: 'alternative' }, { name: 'rock' }] },
        },
      })
    );

    const result = await lastfmProvider.capabilities['artist.enrich']!(
      { name: 'Radiohead' } as never
    );

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ biography: 'An English rock band.', tags: ['alternative', 'rock'] });
  });

  it('never supplies a cover — CAA/artist-image sourcing does not belong to artist.enrich here', async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse({ artist: { bio: { summary: 'Bio' }, tags: { tag: [] } } })
    );

    const result = await lastfmProvider.capabilities['artist.enrich']!(
      { name: 'Radiohead' } as never
    );

    expect(result).not.toHaveProperty('cover');
  });
});
