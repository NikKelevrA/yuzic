import { createRateLimiter, RateLimitAbortError } from './rateLimit';

function fakeClock() {
  let t = 0;
  const waits: number[] = [];
  return {
    now: () => t,
    wait: async (ms: number) => { waits.push(ms); t += ms; },
    waits,
  };
}

describe('createRateLimiter', () => {
  it('spaces a burst so no two calls start closer than the interval', async () => {
    const clock = fakeClock();
    const limit = createRateLimiter(1000, clock.now, clock.wait);
    const starts: number[] = [];

    await Promise.all([1, 2, 3].map(() => limit(async () => { starts.push(clock.now()); })));

    expect(starts).toEqual([0, 1000, 2000]);
  });

  it('runs calls in the order they were scheduled', async () => {
    const clock = fakeClock();
    const limit = createRateLimiter(10, clock.now, clock.wait);
    const order: string[] = [];

    await Promise.all(['a', 'b', 'c'].map(id => limit(async () => { order.push(id); })));

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('skips a superseded call without spending its slot', async () => {
    const clock = fakeClock();
    const limit = createRateLimiter(1000, clock.now, clock.wait);
    const stale = new AbortController();
    const ran: string[] = [];

    const first = limit(async () => { ran.push('first'); });
    const second = limit(async () => { ran.push('stale'); }, stale.signal);
    const third = limit(async () => { ran.push('latest'); });
    stale.abort();

    await first;
    await expect(second).rejects.toBeInstanceOf(RateLimitAbortError);
    await third;

    expect(ran).toEqual(['first', 'latest']);
    // The stale call never started, so the latest one waited one interval, not two.
    expect(clock.now()).toBe(1000);
  });

  it('keeps the line moving after a call fails', async () => {
    const clock = fakeClock();
    const limit = createRateLimiter(5, clock.now, clock.wait);

    await expect(limit(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });
});
