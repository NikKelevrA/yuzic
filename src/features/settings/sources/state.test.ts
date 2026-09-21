import sourcesReducer, {
  selectEnabledSourcesFor,
  selectSourceFallbackUrls,
  selectSourceServerUrls,
  selectSourceUse,
  setSourceFallbackUrl,
  setSourceServerUrl,
  setSourceUse,
  setSourceUses,
  stopUsingSource,
} from './state';
import { SOURCE_USES, usesOf } from '@/providers/registry/sources';

const stateOf = (settingsSources: ReturnType<typeof sourcesReducer>) => ({ settingsSources });
const reduce = (...actions: Parameters<typeof sourcesReducer>[1][]) =>
  stateOf(actions.reduce(sourcesReducer, sourcesReducer(undefined, { type: 'init' })));

describe('source uses', () => {
  it('starts with every outside source off', () => {
    const state = reduce();
    for (const use of SOURCE_USES) expect(selectSourceUse(use.id)(state)).toBe(false);
  });

  it('turns one use on without touching the same source’s other uses', () => {
    const state = reduce(setSourceUse({ use: 'deezer.artwork', enabled: true }));
    expect(selectSourceUse('deezer.artwork')(state)).toBe(true);
    expect(selectSourceUse('deezer.previews')(state)).toBe(false);
  });

  it('lists the sources on for a purpose in the fixed order, not the order they were turned on', () => {
    const state = reduce(
      setSourceUse({ use: 'deezer.artwork', enabled: true }),
      setSourceUse({ use: 'coverartarchive.artwork', enabled: true }),
    );
    expect(selectEnabledSourcesFor('artwork')(state)).toEqual(['coverartarchive', 'deezer']);
  });

  it('gives a subscriber the same list until the uses change', () => {
    const state = reduce(setSourceUse({ use: 'lrclib.lyrics', enabled: true }));
    expect(selectEnabledSourcesFor('lyrics')(state)).toBe(selectEnabledSourcesFor('lyrics')(state));
  });

  it('stops using a source everywhere at once', () => {
    const state = reduce(
      setSourceUses({ uses: usesOf('deezer').map(use => use.id), enabled: true }),
      setSourceUse({ use: 'lastfm.artistInfo', enabled: true }),
      stopUsingSource('deezer'),
    );
    for (const use of usesOf('deezer')) expect(selectSourceUse(use.id)(state)).toBe(false);
    expect(selectSourceUse('lastfm.artistInfo')(state)).toBe(true);
  });
});

describe('server addresses', () => {
  it('starts with none, which means the public server', () => {
    expect(selectSourceServerUrls(reduce())).toEqual({});
  });

  it('stores the address for one source, trimmed', () => {
    const state = reduce(setSourceServerUrl({ source: 'musicbrainz', url: '  http://nas:5000  ' }));
    expect(selectSourceServerUrls(state)).toEqual({ musicbrainz: 'http://nas:5000' });
  });

  it('goes back to the public server when the address is emptied', () => {
    const state = reduce(
      setSourceServerUrl({ source: 'musicbrainz', url: 'http://nas:5000' }),
      setSourceServerUrl({ source: 'musicbrainz', url: '   ' }),
    );
    expect(selectSourceServerUrls(state)).toEqual({});
  });

  it('is kept when every use of the source is turned off', () => {
    const state = reduce(
      setSourceServerUrl({ source: 'musicbrainz', url: 'http://nas:5000' }),
      setSourceUse({ use: 'musicbrainz.search', enabled: true }),
      stopUsingSource('musicbrainz'),
    );
    expect(selectSourceServerUrls(state)).toEqual({ musicbrainz: 'http://nas:5000' });
  });

  it('reads settings saved before addresses existed as none', () => {
    const saved = { settingsSources: { uses: {} } } as unknown as Parameters<typeof selectSourceServerUrls>[0];
    expect(selectSourceServerUrls(saved)).toEqual({});
  });

  it('hands a subscriber the same object until an address changes', () => {
    const state = reduce();
    expect(selectSourceServerUrls(state)).toBe(selectSourceServerUrls(state));
  });
});

describe('fallback addresses', () => {
  it('starts with none', () => {
    expect(selectSourceFallbackUrls(reduce())).toEqual({});
  });

  it('stores the fallback for one source, trimmed, and removes it when emptied', () => {
    const set = reduce(setSourceFallbackUrl({ source: 'musicbrainz', url: '  http://100.64.0.1:5000  ' }));
    expect(selectSourceFallbackUrls(set)).toEqual({ musicbrainz: 'http://100.64.0.1:5000' });
    const cleared = reduce(
      setSourceFallbackUrl({ source: 'musicbrainz', url: 'http://100.64.0.1:5000' }),
      setSourceFallbackUrl({ source: 'musicbrainz', url: '  ' }),
    );
    expect(selectSourceFallbackUrls(cleared)).toEqual({});
  });

  it('goes when the address it backs up is emptied', () => {
    const state = reduce(
      setSourceServerUrl({ source: 'musicbrainz', url: 'http://nas:5000' }),
      setSourceFallbackUrl({ source: 'musicbrainz', url: 'http://100.64.0.1:5000' }),
      setSourceServerUrl({ source: 'musicbrainz', url: '' }),
    );
    expect(selectSourceFallbackUrls(state)).toEqual({});
  });

  it('reads settings saved before fallbacks existed as none', () => {
    const saved = { settingsSources: { uses: {}, serverUrls: {} } } as unknown as Parameters<typeof selectSourceFallbackUrls>[0];
    expect(selectSourceFallbackUrls(saved)).toEqual({});
  });
});
