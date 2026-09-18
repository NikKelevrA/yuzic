import {
  SETTLE_EPSILON,
  isAtRest,
  measurementHeldStill,
  restingSlotY,
} from './coverSlotMeasurement';

const WINDOW_HEIGHT = 844;

describe('isAtRest', () => {
  it('counts both ends of the travel', () => {
    expect(isAtRest(0)).toBe(true);
    expect(isAtRest(1)).toBe(true);
  });

  it('does not count the middle of the travel', () => {
    expect(isAtRest(0.5)).toBe(false);
    expect(isAtRest(0.95)).toBe(false);
  });

  it('tolerates a spring settling just short of its target', () => {
    expect(isAtRest(1 - SETTLE_EPSILON / 2)).toBe(true);
    expect(isAtRest(SETTLE_EPSILON / 2)).toBe(true);
  });

  // The regression: `expansion >= 1` called the whole overshoot "at rest", so
  // the slot was measured while the surface was still moving fastest.
  it('does not count an overshoot as arrived', () => {
    expect(isAtRest(1.008)).toBe(false);
  });
});

describe('measurementHeldStill', () => {
  it('accepts a measurement taken while nothing moved', () => {
    expect(measurementHeldStill(1, 1)).toBe(true);
    expect(measurementHeldStill(0, 0)).toBe(true);
  });

  it('rejects one taken across the surface moving', () => {
    // A spring passing 1 covers far more than this in a single frame.
    expect(measurementHeldStill(1, 1.008)).toBe(false);
    expect(measurementHeldStill(0.4, 0.62)).toBe(false);
  });
});

describe('restingSlotY', () => {
  it('leaves an open, unscrolled measurement alone', () => {
    expect(restingSlotY(300, 1, WINDOW_HEIGHT, 0)).toBe(300);
  });

  it('lifts a measurement taken while closed by a whole screen', () => {
    expect(restingSlotY(300 + WINDOW_HEIGHT, 0, WINDOW_HEIGHT, 0)).toBe(300);
  });

  it('undoes the scroll as well, so the rect always means "unscrolled"', () => {
    expect(restingSlotY(200, 1, WINDOW_HEIGHT, 100)).toBe(300);
  });

  /**
   * The bug this file exists for. A measurement whose position and expansion
   * come from the same instant is correct at any point in the travel —
   * including mid-overshoot, where the surface sits slightly *above* its
   * resting place and the undo is a negative one.
   */
  it('is exact at any single instant, including mid-overshoot', () => {
    const overshoot = 1.008;
    const surfaceOffset = (1 - overshoot) * WINDOW_HEIGHT;
    expect(restingSlotY(300 + surfaceOffset, overshoot, WINDOW_HEIGHT, 0)).toBeCloseTo(300);
  });

  /**
   * And why a drifting one has to be thrown away rather than stored: the
   * position is seen at one expansion and undone at another, and the error is
   * the whole difference in surface travel between them — points, not pixels
   * of rounding.
   */
  it('is wrong by the surface travel when the two moments disagree', () => {
    const seenAt = 1.0;
    const undoneAt = 1.008;
    const y = 300 + (1 - seenAt) * WINDOW_HEIGHT;
    const skew = restingSlotY(y, undoneAt, WINDOW_HEIGHT, 0) - 300;
    expect(Math.abs(skew)).toBeCloseTo(Math.abs(undoneAt - seenAt) * WINDOW_HEIGHT);
    expect(Math.abs(skew)).toBeGreaterThan(5);
  });
});
