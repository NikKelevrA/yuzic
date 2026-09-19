import reducer, {
  MAX_EVENTS,
  clearListeningHistory,
  recordListen,
  seedFromLegacyCounts,
  type RecordedListen,
} from './listeningSlice';
import { SESSION_GAP_MS } from '@/features/listening/listeningEvent';

const BASE = 1_700_000_000_000;

const listen = (over: Partial<RecordedListen> = {}): RecordedListen => ({
  at: BASE,
  track: 's1:t1',
  album: 's1:al1',
  artist: 's1:ar1',
  seconds: 200,
  duration: 240,
  ending: 'finished',
  ...over,
});

const empty = () => reducer(undefined, { type: '@@init' });

describe('recordListen', () => {
  /**
   * The whole reason this replaced a counter: a skip at twenty seconds never
   * reached the scrobble threshold, so the old system recorded nothing at all
   * for the strongest negative signal the app ever receives.
   */
  it('records a skip, which the counter it replaced could not see', () => {
    const state = reducer(empty(), recordListen(listen({ ending: 'skipped', seconds: 20 })));
    expect(state.events).toHaveLength(1);
    expect(state.totals['s1:t1']).toMatchObject({ starts: 1, plays: 0, rejections: 1 });
  });

  it('counts a finished track as a play', () => {
    const state = reducer(empty(), recordListen(listen()));
    expect(state.totals['s1:t1']).toMatchObject({ starts: 1, plays: 1, rejections: 0 });
  });

  it('accumulates seconds and moves the last-played mark', () => {
    let state = reducer(empty(), recordListen(listen({ seconds: 100 })));
    state = reducer(state, recordListen(listen({ at: BASE + 1000, seconds: 150 })));
    expect(state.totals['s1:t1'].seconds).toBe(250);
    expect(state.totals['s1:t1'].firstAt).toBe(BASE);
    expect(state.totals['s1:t1'].lastAt).toBe(BASE + 1000);
  });

  /**
   * A zero-length listen is a track loaded and left, or the same departure
   * reported twice. Both would distort skip rate, the one derived figure that
   * divides by starts.
   */
  it('ignores a listen of no length', () => {
    const state = reducer(empty(), recordListen(listen({ seconds: 0 })));
    expect(state.events).toHaveLength(0);
    expect(state.totals).toEqual({});
  });

  it('opens a new sitting after a long enough gap', () => {
    let state = reducer(empty(), recordListen(listen()));
    state = reducer(state, recordListen(listen({ at: BASE + 60_000 })));
    state = reducer(state, recordListen(listen({ at: BASE + SESSION_GAP_MS + 120_000 })));
    expect(state.events.map(e => e.session)).toEqual([1, 1, 2]);
  });

  it('keeps the ring bounded, oldest out first', () => {
    let state = empty();
    for (let i = 0; i < MAX_EVENTS + 50; i += 1) {
      state = reducer(state, recordListen(listen({ at: BASE + i * 1000, track: `s1:t${i}` })));
    }
    expect(state.events).toHaveLength(MAX_EVENTS);
    expect(state.events[0].track).toBe('s1:t50');
  });

  /**
   * The rollups are what make a play count safe to show. If they were evicted
   * with the events, a lifetime figure would silently fall as the ring wrapped.
   */
  it('keeps the rollup for a track whose events have been evicted', () => {
    let state = reducer(empty(), recordListen(listen({ track: 's1:first' })));
    for (let i = 0; i < MAX_EVENTS + 10; i += 1) {
      state = reducer(state, recordListen(listen({ at: BASE + i * 1000, track: `s1:t${i}` })));
    }
    expect(state.events.some(e => e.track === 's1:first')).toBe(false);
    expect(state.totals['s1:first'].plays).toBe(1);
  });
});

describe('seedFromLegacyCounts', () => {
  /**
   * Without this, the update that shipped the log resets everyone's play
   * counts to zero — throwing away the only record the app had of years of
   * listening, in the change meant to take that record seriously.
   */
  it('carries the old counters across', () => {
    const state = reducer(empty(), seedFromLegacyCounts({
      plays: { 's1:t1': 47 },
      lastPlayedAt: { 's1:t1': BASE },
    }));
    expect(state.totals['s1:t1']).toMatchObject({ plays: 47, starts: 47, lastAt: BASE });
  });

  it('does not overwrite a track the log already knows about', () => {
    let state = reducer(empty(), recordListen(listen()));
    state = reducer(state, seedFromLegacyCounts({
      plays: { 's1:t1': 999 },
      lastPlayedAt: { 's1:t1': BASE },
    }));
    expect(state.totals['s1:t1'].plays).toBe(1);
  });

  it('skips zero counts rather than minting empty rows', () => {
    // Jellyfin reports PlayCount: 0 for everything; seeding those would
    // recreate the fifty-thousand-zeros problem this design avoids.
    const state = reducer(empty(), seedFromLegacyCounts({
      plays: { 's1:t1': 0 },
      lastPlayedAt: {},
    }));
    expect(state.totals).toEqual({});
  });
});

describe('clearListeningHistory', () => {
  /**
   * A privacy control. Clearing the events and leaving the rollups would look
   * like deletion without being it.
   */
  it('takes the rollups with it', () => {
    let state = reducer(empty(), recordListen(listen()));
    state = reducer(state, clearListeningHistory());
    expect(state.events).toEqual([]);
    expect(state.totals).toEqual({});
  });
});
