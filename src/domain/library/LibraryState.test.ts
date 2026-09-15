import {
  isStrongerLibraryState,
  LIBRARY_STATE_PRECEDENCE,
  resolveLibraryState,
} from './LibraryState';
import type { LibraryFacts, LibraryState } from './LibraryState';

describe('resolveLibraryState', () => {
  // Precedence proof: presence beats intent beats capability beats visibility.
  const cases: [LibraryFacts, LibraryState][] = [
    [{ isPresent: true, isWanted: true, isAcquirable: true }, 'in-library'],
    [{ isPresent: true, isWanted: true, isAcquirable: false }, 'in-library'],
    [{ isPresent: true, isWanted: false, isAcquirable: true }, 'in-library'],
    [{ isPresent: true, isWanted: false, isAcquirable: false }, 'in-library'],
    [{ isPresent: false, isWanted: true, isAcquirable: true }, 'wanted'],
    [{ isPresent: false, isWanted: true, isAcquirable: false }, 'wanted'],
    [{ isPresent: false, isWanted: false, isAcquirable: true }, 'acquirable'],
    [{ isPresent: false, isWanted: false, isAcquirable: false }, 'external'],
  ];

  it.each(cases)('resolves %j to %s', (facts, expected) => {
    expect(resolveLibraryState(facts)).toBe(expected);
  });

  it('covers all 8 combinations of the three booleans', () => {
    expect(cases).toHaveLength(8);
  });
});

describe('isStrongerLibraryState', () => {
  it('agrees with LIBRARY_STATE_PRECEDENCE for every ordered pair', () => {
    for (const a of LIBRARY_STATE_PRECEDENCE) {
      for (const b of LIBRARY_STATE_PRECEDENCE) {
        const expected = LIBRARY_STATE_PRECEDENCE.indexOf(a) < LIBRARY_STATE_PRECEDENCE.indexOf(b);
        expect(isStrongerLibraryState(a, b)).toBe(expected);
      }
    }
  });

  it('is false when comparing a state to itself', () => {
    for (const state of LIBRARY_STATE_PRECEDENCE) {
      expect(isStrongerLibraryState(state, state)).toBe(false);
    }
  });

  it('is strict: exactly one of a>b or b>a holds for distinct states', () => {
    expect(isStrongerLibraryState('in-library', 'wanted')).toBe(true);
    expect(isStrongerLibraryState('wanted', 'in-library')).toBe(false);
  });
});
