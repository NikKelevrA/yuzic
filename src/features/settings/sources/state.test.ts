import sourcesReducer, {
  selectEnabledSourcesFor,
  selectSourceInUse,
  selectSourceUse,
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
    expect(selectSourceInUse('deezer')(state)).toBe(true);
    expect(selectSourceInUse('lastfm')(state)).toBe(false);
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
    expect(selectSourceInUse('deezer')(state)).toBe(false);
    expect(selectSourceUse('lastfm.artistInfo')(state)).toBe(true);
  });
});
