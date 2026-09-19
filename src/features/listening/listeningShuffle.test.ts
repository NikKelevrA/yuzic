import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import { shuffleWeight, weightedShuffle } from './listeningShuffle';

const totals = (over: Partial<EntityTotals> = {}): EntityTotals => ({
  plays: 10, starts: 10, rejections: 0, seconds: 2400, firstAt: 0, lastAt: 0, ...over,
});

/** A deterministic stand-in for Math.random, cycling a fixed sequence. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('weightedShuffle', () => {
  it('keeps every item', () => {
    const items = ['a', 'b', 'c', 'd'];
    const shuffled = weightedShuffle(items, () => 1, sequence([0.1, 0.9, 0.5, 0.3]));
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  /**
   * The contract a shuffle has to keep. A weighted order that always put the
   * same track first would not be a shuffle, whatever else it was.
   */
  it('gives a different order for different draws', () => {
    const items = ['a', 'b', 'c', 'd'];
    const first = weightedShuffle(items, () => 1, sequence([0.1, 0.9, 0.5, 0.3]));
    const second = weightedShuffle(items, () => 1, sequence([0.9, 0.1, 0.3, 0.5]));
    expect(first).not.toEqual(second);
  });

  it('tends to put heavier items first', () => {
    // Same draw for every item, so the weight is the only thing deciding.
    const items = [
      { id: 'skipped', weight: 0.2 },
      { id: 'neutral', weight: 1 },
    ];
    const shuffled = weightedShuffle(items, item => item.weight, () => 0.5);
    expect(shuffled.map(i => i.id)).toEqual(['neutral', 'skipped']);
  });

  /**
   * Over many draws the disliked track must still come first sometimes. A
   * listener who never hears something again can never change their mind
   * about it, and a shuffle that guaranteed an order would not be one.
   */
  it('still lets a disliked track come first sometimes', () => {
    let first = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      const shuffled = weightedShuffle(
        [{ id: 'bad', weight: 0.2 }, { id: 'ok', weight: 1 }],
        item => item.weight,
        // A cheap deterministic generator, distinct per iteration.
        sequence([((seed * 37) % 100) / 100, ((seed * 61) % 100) / 100]),
      );
      if (shuffled[0].id === 'bad') first += 1;
    }
    expect(first).toBeGreaterThan(0);
  });

  /**
   * A zero weight would make the exponent infinite and the key zero — exclusion
   * by arithmetic rather than by anybody's decision.
   */
  it('does not let a zero weight drop an item', () => {
    const shuffled = weightedShuffle(['a', 'b'], item => (item === 'a' ? 0 : 1), () => 0.5);
    expect(shuffled).toHaveLength(2);
  });

  it('is uniform when every weight is equal', () => {
    // With one draw each and equal weights, the keys are the draws themselves,
    // so the order is exactly the random order — no bias introduced.
    const shuffled = weightedShuffle(['a', 'b', 'c'], () => 1, sequence([0.2, 0.9, 0.5]));
    expect(shuffled).toEqual(['b', 'c', 'a']);
  });
});

describe('shuffleWeight', () => {
  /**
   * Unknown and never-skipped are treated alike, which is the honest reading
   * and what keeps a fresh install's shuffle uniform.
   */
  it('is neutral for a track nothing is known about', () => {
    expect(shuffleWeight(undefined)).toBe(1);
    expect(shuffleWeight(totals({ starts: 10, rejections: 0 }))).toBe(1);
  });

  it('falls for a track the listener keeps abandoning', () => {
    expect(shuffleWeight(totals({ starts: 10, rejections: 10 }))).toBe(0.2);
  });

  it('never reaches zero', () => {
    expect(shuffleWeight(totals({ starts: 100, rejections: 100 }))).toBeGreaterThan(0);
  });
});
