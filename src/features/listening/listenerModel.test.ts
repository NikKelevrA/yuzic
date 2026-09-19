import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import type { ListenEvent } from './listeningEvent';
import { ENOUGH_TO_KNOW, UNINFORMED_MODEL, buildListenerModel } from './listenerModel';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => NOW - days * DAY;

const totals = (over: Partial<EntityTotals> = {}): EntityTotals => ({
  plays: 10, starts: 10, rejections: 0, seconds: 2400, firstAt: daysAgo(400), lastAt: daysAgo(5),
  ...over,
});

/** Enough events that the model considers itself informed. */
function filler(count = ENOUGH_TO_KNOW): ListenEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    at: NOW - (count - i) * 60_000,
    track: `s1:filler${i}`,
    seconds: 200,
    duration: 240,
    ending: 'finished' as const,
    session: 1,
  }));
}

const model = (over: { events?: ListenEvent[]; totals?: Record<string, EntityTotals> } = {}) =>
  buildListenerModel({
    events: over.events ?? filler(),
    totals: over.totals ?? {},
    now: NOW,
  });

const keyOf = (key: string) => key;

/**
 * One surface every feature asks, so two features cannot quietly disagree
 * about what a skip is worth.
 */
describe('buildListenerModel', () => {
  it('scores something it has never heard of at zero rather than throwing', () => {
    const m = model();
    expect(m.affinityOf('unknown')).toBe(0);
    expect(m.dormancyOf('unknown')).toBe(0);
    expect(m.rejectionOf('unknown')).toBe(0);
    expect(m.reasonFor('unknown').daysSinceLastPlay).toBeNull();
  });

  it('reports whether it knows enough to be worth asking', () => {
    expect(model({ events: filler(ENOUGH_TO_KNOW - 1) }).informed).toBe(false);
    expect(model({ events: filler(ENOUGH_TO_KNOW) }).informed).toBe(true);
  });
});

/**
 * A caller states a purpose rather than choosing a formula, so the policies
 * sit next to each other and can be compared.
 */
describe('order', () => {
  const loved = totals({ plays: 50, starts: 50, lastAt: daysAgo(2) });
  const dropped = totals({ plays: 50, starts: 50, lastAt: daysAgo(800) });
  const skipped = totals({ plays: 1, starts: 20, rejections: 18, lastAt: daysAgo(2) });

  it('puts what the listener is into now first, for favourite', () => {
    const m = model({ totals: { loved, dropped } });
    expect(m.order(['dropped', 'loved'], keyOf, 'favourite')).toEqual(['loved', 'dropped']);
  });

  /**
   * The inverse, and the one thing here a streaming service cannot compute:
   * it needs a long tail the listener owns and a history of them loving it.
   */
  it('digs up what was loved and dropped, for rediscover', () => {
    const m = model({ totals: { loved, dropped } });
    expect(m.order(['loved', 'dropped'], keyOf, 'rediscover')).toEqual(['dropped', 'loved']);
  });

  it('demotes what gets abandoned, for continue', () => {
    const m = model({ totals: { skipped } });
    expect(m.order(['skipped', 'other'], keyOf, 'continue')).toEqual(['other', 'skipped']);
  });

  it('keeps everything when shuffling', () => {
    const m = model({ totals: { skipped } });
    const items = ['skipped', 'a', 'b', 'c'];
    expect([...m.order(items, keyOf, 'shuffle')].sort()).toEqual([...items].sort());
  });

  it('honours a limit on the ranked purposes', () => {
    const m = model({ totals: { loved, dropped, skipped } });
    expect(m.order(['loved', 'dropped', 'skipped'], keyOf, 'favourite', { limit: 1 })).toHaveLength(1);
  });

  /**
   * A handful of listens is not a taste. Acting on one would mean a fresh
   * install's second session already being steered by its first.
   */
  it('leaves everything alone until it knows enough', () => {
    const m = model({
      events: filler(3),
      totals: { skipped, loved },
    });
    expect(m.order(['skipped', 'loved'], keyOf, 'continue')).toEqual(['skipped', 'loved']);
    expect(m.order(['skipped', 'loved'], keyOf, 'favourite')).toEqual(['skipped', 'loved']);
  });

  it('still shuffles when it knows nothing, rather than returning the input', () => {
    const m = model({ events: filler(2) });
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    // Uniformly, but a shuffle all the same — "no information" is not "no
    // shuffle", and a caller that asked for one must get one.
    const orders = new Set(
      Array.from({ length: 12 }, () => m.order(items, keyOf, 'shuffle').join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('UNINFORMED_MODEL', () => {
  /**
   * For callers with no history to hand. Better than an optional model
   * threaded through call sites, which is how half of them end up forgetting
   * to check.
   */
  it('changes nothing', () => {
    expect(UNINFORMED_MODEL.informed).toBe(false);
    expect(UNINFORMED_MODEL.affinityOf('anything')).toBe(0);
    expect(UNINFORMED_MODEL.order(['a', 'b'], keyOf, 'continue')).toEqual(['a', 'b']);
  });
});
