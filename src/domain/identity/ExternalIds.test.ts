import { normalizeExternalIds } from './ExternalIds';

describe('normalizeExternalIds', () => {
  it('drops nulls and empty strings, which providers use for "no id"', () => {
    expect(normalizeExternalIds({ mbid: null, deezerId: '', isrc: 'GB123' }))
      .toEqual({ isrc: 'GB123' });
  });

  it('keeps an absent id absent rather than present-and-empty', () => {
    const ids = normalizeExternalIds({ mbid: null });
    expect('mbid' in ids).toBe(false);
  });

  it('tolerates anything that is not an id bag at all', () => {
    expect(normalizeExternalIds(undefined)).toEqual({});
    expect(normalizeExternalIds(null)).toEqual({});
    expect(normalizeExternalIds('nope')).toEqual({});
  });
});
