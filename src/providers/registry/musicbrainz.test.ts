/**
 * HTTP-boundary fixture tests for the MusicBrainz provider's correct
 * responsibilities: `artist.enrich` never supplies artwork (Cover Art
 * Archive is album-only), and `album.enrich` resolves a release-group by
 * artist+title search rather than probing any artist mbid against a
 * release-group lookup.
 */
import { musicbrainzProvider } from './musicbrainz';
import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';

jest.mock('@/providers/http/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));

const mockedFetch = fetchWithTimeout as jest.Mock;

function jsonResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('musicbrainzProvider artist.enrich', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('never returns a cover — negative control: CAA is album-only, not an artist-image provider', async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse({ artists: [{ id: 'artist-mbid-1', name: 'Radiohead', annotation: 'A band.' }] })
    );

    const result = await musicbrainzProvider.capabilities['artist.enrich']!(
      { name: 'Radiohead' } as never
    );

    expect(result).not.toHaveProperty('cover');
    expect(result).toEqual({ biography: 'A band.', externalIds: { mbid: 'artist-mbid-1' } });
  });
});

describe('musicbrainzProvider album.enrich', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('resolves cover via a release-group search keyed on artist+title, not an artist mbid', async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse({ 'release-groups': [{ id: 'rg-1', title: 'OK Computer' }] })
    );

    const result = await musicbrainzProvider.capabilities['album.enrich']!(
      { title: 'OK Computer', artist: { name: 'Radiohead' } } as never
    );

    // The request must be a release-group search, never an artist-mbid ->
    // release-group probe.
    const [path] = mockedFetch.mock.calls[0];
    expect(path).toContain('/release-group?query=');
    expect(path).not.toContain('/artist/');

    expect(result).toEqual({
      cover: { kind: 'coverartarchive', mbid: 'rg-1', mbidType: 'release-group' },
      externalIds: { mbid: 'rg-1', mbidType: 'release-group' },
    });
  });
});
