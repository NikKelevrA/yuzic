import type { TrackTotals } from '@/state/redux/slices/listeningSlice';
import {
  AFFINITY_HALF_LIFE_DAYS,
  affinity,
  dormancy,
  listenQuality,
  rankBy,
  recencyWeight,
  rejectionRate,
} from './listeningAffinity';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const daysAgo = (days: number) => NOW - days * DAY;

const totals = (over: Partial<TrackTotals> = {}): TrackTotals => ({
  plays: 10,
  starts: 10,
  rejections: 0,
  seconds: 2400,
  firstAt: daysAgo(400),
  lastAt: daysAgo(10),
  ...over,
});

describe('recencyWeight', () => {
  it('is one for something played now and a half at the half-life', () => {
    expect(recencyWeight(NOW, NOW)).toBeCloseTo(1);
    expect(recencyWeight(daysAgo(AFFINITY_HALF_LIFE_DAYS), NOW)).toBeCloseTo(0.5, 5);
  });

  it('is zero for something never played', () => {
    expect(recencyWeight(0, NOW)).toBe(0);
  });

  /**
   * A device with a wrong clock, or a server timestamp from another zone,
   * would otherwise weigh above one and outrank everything real.
   */
  it('cannot exceed one for a timestamp in the future', () => {
    expect(recencyWeight(NOW + 30 * DAY, NOW)).toBe(1);
  });
});

describe('quality', () => {
  it('falls with the share of starts abandoned early', () => {
    expect(rejectionRate(totals({ starts: 10, rejections: 4 }))).toBeCloseTo(0.4);
    expect(listenQuality(totals({ starts: 10, rejections: 4 }))).toBeCloseTo(0.6);
  });

  /**
   * A track skipped every time is still one the listener put in their library
   * and keeps starting. The floor ranks it last rather than erasing it from
   * the surfaces meant to ask whether they still want it.
   */
  it('never reaches zero, however often the track is skipped', () => {
    expect(listenQuality(totals({ starts: 10, rejections: 10 }))).toBe(0.2);
  });

  /**
   * A row seeded from the old counters has starts but no recorded rejections.
   * Reading that absence as "never skipped" would flatter it.
   */
  it('reads no evidence as no penalty, not as a clean record', () => {
    expect(rejectionRate({ ...totals(), starts: 0, rejections: 0 })).toBe(0);
  });
});

describe('affinity and dormancy', () => {
  it('rank the same track oppositely as it ages', () => {
    const fresh = totals({ lastAt: daysAgo(2) });
    const stale = totals({ lastAt: daysAgo(900) });

    expect(affinity(fresh, NOW)).toBeGreaterThan(affinity(stale, NOW));
    expect(dormancy(stale, NOW)).toBeGreaterThan(dormancy(fresh, NOW));
  });

  /**
   * The whole point of the rediscovery surface: something loved and dropped
   * must beat something mildly liked and dropped, not merely anything old.
   */
  it('rank a forgotten favourite above a forgotten indifference', () => {
    const loved = totals({ plays: 60, starts: 60, lastAt: daysAgo(700) });
    const barely = totals({ plays: 2, starts: 2, lastAt: daysAgo(700) });
    expect(dormancy(loved, NOW)).toBeGreaterThan(dormancy(barely, NOW));
  });

  /**
   * "You loved this and stopped" and "you have never opened this" are
   * different sentences and want different surfaces, so dormancy requires
   * evidence of past love rather than mere absence.
   */
  it('give a never-played track no dormancy at all', () => {
    const never = totals({ plays: 0, starts: 0, lastAt: 0 });
    expect(dormancy(never, NOW)).toBe(0);
  });

  it('discount a track that is mostly skipped', () => {
    const clean = totals({ starts: 20, rejections: 0 });
    const skipped = totals({ starts: 20, rejections: 15 });
    expect(affinity(skipped, NOW)).toBeLessThan(affinity(clean, NOW));
  });
});

describe('rankBy', () => {
  it('orders by score and drops the ones that score nothing', () => {
    const entries = [{ n: 1 }, { n: 0 }, { n: 5 }];
    expect(rankBy(entries, e => e.n, 10)).toEqual([{ n: 5 }, { n: 1 }]);
  });

  /**
   * A zero-scoring entry is not an answer to the question being asked, so a
   * shorter shelf is the honest result. Padding one is how a surface stops
   * meaning anything.
   */
  it('returns a short list rather than padding it', () => {
    expect(rankBy([{ n: 0 }, { n: 0 }], e => e.n, 10)).toEqual([]);
  });

  it('honours the limit', () => {
    expect(rankBy([{ n: 3 }, { n: 2 }, { n: 1 }], e => e.n, 2)).toHaveLength(2);
  });
});
