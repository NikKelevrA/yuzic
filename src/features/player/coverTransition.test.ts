import { canStartCoverSlide, coverScale, coverSlideSettled } from './coverTransition';

describe('coverSlideSettled', () => {
  it('holds the row still until playback has actually changed track', () => {
    expect(coverSlideSettled('current', 'current')).toBe(false);
  });

  it('re-centres once the new track has arrived', () => {
    expect(coverSlideSettled('current', 'next')).toBe(true);
  });

  it('waits rather than re-centring on nothing', () => {
    // No current track is the player between queues, not a completed skip.
    expect(coverSlideSettled('current', undefined)).toBe(false);
  });
});

describe('coverScale', () => {
  const BAR = 50;
  const FULL = 350;
  const REFERENCE = 400;

  it('draws each end at exactly the size that end measured', () => {
    expect(coverScale(BAR, FULL, 0, REFERENCE)).toBeCloseTo(BAR / REFERENCE);
    expect(coverScale(BAR, FULL, 1, REFERENCE)).toBeCloseTo(FULL / REFERENCE);
  });

  it('spends the growth on area, so half way up is half the area and not half the edge', () => {
    const half = coverScale(BAR, FULL, 0.5, REFERENCE) * REFERENCE;
    expect(half * half).toBeCloseTo((BAR * BAR + FULL * FULL) / 2);
    // The edge-linear answer would be 200; area-linear lands above it, which
    // is the whole point — it is what stops the cover running away near the top.
    expect(half).toBeGreaterThan((BAR + FULL) / 2);
  });

  it('clamps past either end rather than overshooting the slot', () => {
    expect(coverScale(BAR, FULL, -0.4, REFERENCE)).toBeCloseTo(BAR / REFERENCE);
    expect(coverScale(BAR, FULL, 1.6, REFERENCE)).toBeCloseTo(FULL / REFERENCE);
  });

  it('stays a no-op before anything has been laid out', () => {
    // A zero reference is the first frame, not a shrunk cover: scaling by
    // zero there would divide the corner radius by it.
    expect(coverScale(BAR, FULL, 1, 0)).toBe(1);
  });
});

describe('canStartCoverSlide', () => {
  it('does not strand the outgoing cover when the queue cannot advance', () => {
    expect(canStartCoverSlide('next', 2, 3, 'off')).toBe(false);
    expect(canStartCoverSlide('previous', 0, 3, 'off')).toBe(false);
  });

  it('allows an intentional queue move, including repeat-all from the end', () => {
    expect(canStartCoverSlide('next', 1, 3, 'off')).toBe(true);
    expect(canStartCoverSlide('previous', 1, 3, 'off')).toBe(true);
    expect(canStartCoverSlide('next', 2, 3, 'all')).toBe(true);
  });
});
