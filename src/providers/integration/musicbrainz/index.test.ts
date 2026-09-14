import { coverArtArchiveUrl } from './';

describe('coverArtArchiveUrl', () => {
  it('defaults to the release-group path (every existing call site deals in release-group ids)', () => {
    expect(coverArtArchiveUrl('rg-1')).toBe('https://coverartarchive.org/release-group/rg-1/front-500');
  });

  it('uses the release-group path when asked for explicitly', () => {
    expect(coverArtArchiveUrl('rg-1', 'release-group')).toBe(
      'https://coverartarchive.org/release-group/rg-1/front-500'
    );
  });

  it('uses the distinct release path for a release mbid — CAA indexes the two under different paths', () => {
    expect(coverArtArchiveUrl('rel-1', 'release')).toBe('https://coverartarchive.org/release/rel-1/front-500');
  });
});
