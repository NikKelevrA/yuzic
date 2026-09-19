import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import type { ListenEvent } from './listeningEvent';
import { buildSequenceGraph } from './listeningSequence';
import { rankForListener, type RankingContext } from './listeningRanking';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let clock = NOW - 30 * DAY;
const play = (track: string, session: number): ListenEvent => {
  clock += 3 * 60 * 1000;
  return { at: clock, track, seconds: 200, duration: 240, ending: 'finished', session };
};

const totals = (over: Partial<EntityTotals> = {}): EntityTotals => ({
  plays: 0, starts: 0, rejections: 0, seconds: 0, firstAt: 0, lastAt: 0, ...over,
});

const context = (over: Partial<RankingContext> = {}): RankingContext => ({
  after: null,
  graph: new Map(),
  totals: {},
  now: NOW,
  ...over,
});

const keyOf = (key: string) => key;

beforeEach(() => { clock = NOW - 30 * DAY; });

/**
 * The provider knows the music; the listener's history knows the listener.
 * Neither is allowed to do the other's job.
 */
describe('rankForListener', () => {
  it('leaves the provider order alone when nothing is known', () => {
    // A fresh install must behave exactly as before this existed.
    expect(rankForListener(['a', 'b', 'c'], keyOf, context())).toEqual(['a', 'b', 'c']);
  });

  it('promotes a track the listener reliably plays after this one', () => {
    const graph = buildSequenceGraph([
      play('cur', 1), play('c', 1),
      play('cur', 2), play('c', 2),
      play('cur', 3), play('c', 3),
    ]);
    expect(rankForListener(['a', 'b', 'c'], keyOf, context({ after: 'cur', graph })))
      .toEqual(['c', 'a', 'b']);
  });

  /**
   * One evening is a coincidence. Letting a single accidental pairing steer a
   * queue is how a habit that does not exist becomes self-fulfilling.
   */
  it('ignores a pairing seen only once', () => {
    const graph = buildSequenceGraph([play('cur', 1), play('c', 1)]);
    expect(rankForListener(['a', 'b', 'c'], keyOf, context({ after: 'cur', graph })))
      .toEqual(['a', 'b', 'c']);
  });

  it('demotes a track the listener keeps abandoning', () => {
    const ranked = rankForListener(['a', 'b', 'c'], keyOf, context({
      totals: { a: totals({ plays: 1, starts: 12, rejections: 11 }) },
    }));
    expect(ranked).toEqual(['b', 'c', 'a']);
  });

  /**
   * Down the batch, never out of it. A skip is weaker evidence than it looks —
   * people skip things they like in the wrong mood — and a listener who never
   * hears a track again can never change their mind about it.
   */
  it('never drops a candidate, however often it was skipped', () => {
    const ranked = rankForListener(['a', 'b'], keyOf, context({
      totals: { a: totals({ plays: 0, starts: 40, rejections: 40 }) },
    }));
    expect(ranked).toHaveLength(2);
    expect(ranked).toContain('a');
  });

  /**
   * Playing something a lot is not a reason to queue it again. Autoplay
   * continues *past* what the listener chose, and ranking by volume is the
   * narrowing that makes an algorithm a loop of somebody's top ten.
   */
  it('does not favour a track merely for being played often', () => {
    const familiar = totals({ plays: 200, starts: 200, lastAt: NOW });
    expect(rankForListener(['a', 'b', 'c'], keyOf, context({ totals: { c: familiar } })))
      .toEqual(['a', 'b', 'c']);
  });

  /**
   * A habit has to be worth more than the provider's own ordering to be worth
   * having, but only once it is really a habit. Two pairings lift a candidate
   * level with the top pick; three take it.
   */
  it('lets a repeated habit take the top of the batch', () => {
    const graph = buildSequenceGraph([
      play('cur', 1), play('c', 1),
      play('cur', 2), play('c', 2),
      play('cur', 3), play('c', 3),
    ]);
    const ranked = rankForListener(['a', 'b', 'c'], keyOf, context({
      after: 'cur',
      graph,
      totals: { a: totals({ plays: 200, starts: 200, lastAt: NOW }) },
    }));
    expect(ranked[0]).toBe('c');
  });

  it('is stable where the adjustment ties', () => {
    const many = ['a', 'b', 'c', 'd', 'e'];
    expect(rankForListener(many, keyOf, context())).toEqual(many);
  });

  it('works on objects, not just keys', () => {
    const graph = buildSequenceGraph([
      play('cur', 1), play('x', 1),
      play('cur', 2), play('x', 2),
    ]);
    const candidates = [{ id: 'w' }, { id: 'x' }];
    expect(rankForListener(candidates, c => c.id, context({ after: 'cur', graph })))
      .toEqual([{ id: 'x' }, { id: 'w' }]);
  });
});
