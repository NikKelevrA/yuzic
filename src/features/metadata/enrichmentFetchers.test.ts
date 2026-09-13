/**
 * HTTP-boundary fixture tests for the `metadata.enrich` fetchers, focused on
 * the Cover Art Archive correction: CAA is album-only (a release or
 * release-group mbid), never an artist-image provider, and it indexes a
 * release and a release-group under different paths.
 */
import { metadataArtworkFetchers } from './enrichmentFetchers';

const originalFetch = global.fetch;

describe('metadataArtworkFetchers.coverartarchive', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('never issues a request for an artist mbid (mbidType absent) — negative control', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await metadataArtworkFetchers.coverartarchive!({
      name: 'Radiohead',
      // This is what the artist header passes today: an *artist* mbid, with
      // no mbidType at all — exactly the shape that used to be probed
      // straight into the release-group endpoint.
      mbid: 'artist-mbid-not-a-release-group',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('never issues a request when mbidType is explicitly "unknown"', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await metadataArtworkFetchers.coverartarchive!({
      name: 'Radiohead',
      mbid: 'some-mbid',
      mbidType: 'unknown',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('requests the release-group path for a release-group mbid', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await metadataArtworkFetchers.coverartarchive!({
      name: 'OK Computer',
      mbid: 'rg-1',
      mbidType: 'release-group',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://coverartarchive.org/release-group/rg-1/front-500',
      { method: 'HEAD' }
    );
    expect(result).toEqual({
      cover: { kind: 'coverartarchive', mbid: 'rg-1', mbidType: 'release-group' },
      source: 'coverartarchive',
    });
  });

  it('requests the release path (not release-group) for a release mbid', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await metadataArtworkFetchers.coverartarchive!({
      name: 'OK Computer',
      mbid: 'release-1',
      mbidType: 'release',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://coverartarchive.org/release/release-1/front-500',
      { method: 'HEAD' }
    );
    expect(result).toEqual({
      cover: { kind: 'coverartarchive', mbid: 'release-1', mbidType: 'release' },
      source: 'coverartarchive',
    });
  });
});
