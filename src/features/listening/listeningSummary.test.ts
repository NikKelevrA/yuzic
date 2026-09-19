import type { ListenEvent } from './listeningEvent';
import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import {
  averageCompletion,
  firstHeardIn,
  lifetimeTotals,
  listeningStreak,
  summarise,
} from './listeningSummary';

const DAY = 24 * 60 * 60 * 1000;
/** A Wednesday at 14:00 local, so hour and weekday buckets are checkable. */
const BASE = new Date(2026, 8, 16, 14, 0, 0).getTime();

const play = (over: Partial<ListenEvent> = {}): ListenEvent => ({
  at: BASE,
  track: 's1:t1',
  album: 's1:al1',
  artist: 's1:ar1',
  seconds: 200,
  duration: 240,
  ending: 'finished',
  session: 1,
  ...over,
});

describe('summarise', () => {
  it('is empty for an empty log, with histograms still shaped', () => {
    const summary = summarise([]);
    expect(summary.plays).toBe(0);
    expect(summary.byHour).toHaveLength(24);
    expect(summary.byWeekday).toHaveLength(7);
  });

  it('separates plays from starts', () => {
    const summary = summarise([
      play(),
      play({ track: 's1:t2', ending: 'skipped', seconds: 20 }),
    ]);
    expect(summary.starts).toBe(2);
    expect(summary.plays).toBe(1);
  });

  /**
   * An hour spent skipping is not an hour of listening, and a clock face
   * saying otherwise is wrong in the way a listener notices first.
   */
  it('counts only real plays into the clock', () => {
    const summary = summarise([
      play(),
      play({ at: BASE + 60_000, ending: 'skipped', seconds: 20 }),
    ]);
    expect(summary.byHour[14]).toBe(1);
    expect(summary.byWeekday[3]).toBe(1);
  });

  it('counts distinct things and sittings', () => {
    const summary = summarise([
      play(),
      play({ track: 's1:t2', session: 2 }),
      play({ track: 's1:t3', artist: 's1:ar2', session: 2 }),
    ]);
    expect(summary.tracks).toBe(3);
    expect(summary.artists).toBe(2);
    expect(summary.sessions).toBe(2);
  });

  it('ranks the top entries by plays', () => {
    const summary = summarise([
      play({ artist: 's1:ar1' }),
      play({ track: 's1:t2', artist: 's1:ar1' }),
      play({ track: 's1:t3', artist: 's1:ar2' }),
    ]);
    expect(summary.topArtists[0]).toMatchObject({ key: 's1:ar1', plays: 2 });
  });

  it('honours the window', () => {
    const summary = summarise(
      [play({ at: BASE - 40 * DAY }), play({ at: BASE })],
      { since: BASE - DAY },
    );
    expect(summary.starts).toBe(1);
  });
});

describe('lifetimeTotals', () => {
  /**
   * These are the figures safe to label "all time" — the rollups outlive the
   * events, so a play count cannot fall as the ring wraps.
   */
  it('adds up the rollups and finds the earliest listen', () => {
    const totals: Record<string, EntityTotals> = {
      a: { plays: 5, starts: 6, rejections: 1, seconds: 1000, firstAt: 500, lastAt: 900 },
      b: { plays: 2, starts: 2, rejections: 0, seconds: 400, firstAt: 100, lastAt: 800 },
    };
    expect(lifetimeTotals(totals)).toEqual({
      plays: 7, starts: 8, seconds: 1400, tracks: 2, since: 100,
    });
  });

  it('is zero for nothing', () => {
    expect(lifetimeTotals({})).toEqual({ plays: 0, starts: 0, seconds: 0, tracks: 0, since: 0 });
  });
});

describe('listeningStreak', () => {
  it('counts consecutive days back from today', () => {
    const events = [play({ at: BASE - 2 * DAY }), play({ at: BASE - DAY }), play({ at: BASE })];
    expect(listeningStreak(events, BASE)).toBe(3);
  });

  /**
   * Breaking a streak at midnight punishes someone for not having listened
   * yet this morning — a number designed to nag rather than to describe.
   */
  it('still runs when the last listen was yesterday', () => {
    expect(listeningStreak([play({ at: BASE - DAY })], BASE)).toBe(1);
  });

  it('is broken by a missed day', () => {
    const events = [play({ at: BASE - 5 * DAY }), play({ at: BASE })];
    expect(listeningStreak(events, BASE)).toBe(1);
  });

  it('is zero when nothing was played recently', () => {
    expect(listeningStreak([play({ at: BASE - 10 * DAY })], BASE)).toBe(0);
  });

  it('ignores days that were only skipping', () => {
    expect(listeningStreak([play({ at: BASE, ending: 'skipped', seconds: 20 })], BASE)).toBe(0);
  });
});

describe('firstHeardIn', () => {
  it('lists what was first heard inside the window, oldest first', () => {
    const totals: Record<string, EntityTotals> = {
      old: { plays: 1, starts: 1, rejections: 0, seconds: 1, firstAt: BASE - 90 * DAY, lastAt: BASE },
      newer: { plays: 1, starts: 1, rejections: 0, seconds: 1, firstAt: BASE - 2 * DAY, lastAt: BASE },
      newest: { plays: 1, starts: 1, rejections: 0, seconds: 1, firstAt: BASE - DAY, lastAt: BASE },
    };
    expect(firstHeardIn(totals, BASE - 7 * DAY)).toEqual(['newer', 'newest']);
  });
});

describe('averageCompletion', () => {
  it('averages how much of things gets heard', () => {
    expect(averageCompletion([
      play({ seconds: 120, duration: 240 }),
      play({ seconds: 240, duration: 240 }),
    ])).toBeCloseTo(0.75);
  });

  /**
   * A stream has no proportion to be through. Counting radio as zero would
   * drag the figure down in proportion to how much of it somebody listens to,
   * which says nothing about their attention.
   */
  it('excludes things with no length rather than scoring them zero', () => {
    expect(averageCompletion([
      play({ seconds: 240, duration: 240 }),
      play({ seconds: 3600, duration: 0 }),
    ])).toBe(1);
  });

  it('is zero when nothing measurable was played', () => {
    expect(averageCompletion([play({ duration: 0 })])).toBe(0);
  });
});
