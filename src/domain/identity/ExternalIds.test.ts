import { normalizeExternalIds, mergeExternalIds } from './ExternalIds';
import type { ExternalIds } from './ExternalIds';

describe('mergeExternalIds', () => {
  it('lets an existing known value win over a newly resolved one', () => {
    const known: ExternalIds = { mbid: 'known-mbid' };
    const resolved: ExternalIds = { mbid: 'resolved-mbid' };

    expect(mergeExternalIds(known, resolved)).toEqual({ mbid: 'known-mbid' });
  });

  it('adds fields present only in resolved', () => {
    const known: ExternalIds = { mbid: 'known-mbid' };
    const resolved: ExternalIds = { deezerId: '123', isrc: 'US-ABC-1234567' };

    expect(mergeExternalIds(known, resolved)).toEqual({
      mbid: 'known-mbid',
      deezerId: '123',
      isrc: 'US-ABC-1234567',
    });
  });

  it('does not let an explicit undefined in known survive as a present key', () => {
    const known: ExternalIds = { mbid: undefined, deezerId: '456' };
    const resolved: ExternalIds = { mbid: 'resolved-mbid' };

    const result = mergeExternalIds(known, resolved);
    expect('mbid' in result).toBe(false);
    expect(result).toEqual({ deezerId: '456' });
  });

  it('does not let an explicit undefined in resolved survive as a present key', () => {
    const known: ExternalIds = {};
    const resolved: ExternalIds = { upc: undefined, deezerId: '789' };

    const result = mergeExternalIds(known, resolved);
    expect('upc' in result).toBe(false);
    expect(result).toEqual({ deezerId: '789' });
  });

  it('returns an empty object when both sides are empty', () => {
    expect(mergeExternalIds({}, {})).toEqual({});
  });
});

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
