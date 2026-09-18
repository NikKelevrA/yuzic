import {
  SETTLE_EPSILON,
  isAtRest,
  measurementHeldStill,
  restingSlotY,
} from './coverSlotMeasurement';
import { PLAYER_SPRING } from './PlayerExpansion';

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

/**
 * The epsilon is only correct *relative to the spring*.
 *
 * 0.001 works because `PLAYER_SPRING` overshoots by about 0.8%, so a band that
 * narrow cannot contain the overshoot and an overshooting player reads as
 * moving. Nothing enforced that: the number was chosen against the spring as it
 * is tuned today, and a softer retune — less damping, more mass — shrinks the
 * overshoot toward the band until the two overlap and `expansion >= 1` is
 * quietly back, measuring mid-flight again with every test still green.
 *
 * So the relationship is asserted rather than the number. Standard second-order
 * step response: a damping ratio of `c / 2√(km)` overshoots by
 * `exp(-πζ/√(1-ζ²))` of the travel.
 */
describe('the settle band against the spring it is sized for', () => {
  const { damping, stiffness, mass = 1 } = PLAYER_SPRING as {
    damping: number; stiffness: number; mass?: number;
  };
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const overshoot = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));

  it('is an underdamped spring, so there is an overshoot to exclude', () => {
    // At ζ >= 1 there is no overshoot and this whole guard is moot — which
    // would itself be a change worth noticing rather than silently passing.
    expect(zeta).toBeLessThan(1);
  });

  it('is narrow enough that the overshoot cannot sit inside it', () => {
    expect(SETTLE_EPSILON).toBeLessThan(overshoot);
  });

  it('leaves room, rather than only just clearing it', () => {
    // The margin is a factor of about 7.7 as tuned today — 0.001 against an
    // overshoot of 0.0077 — which is comfortable but is *not* the order of
    // magnitude it looks like. Five is asserted rather than seven so an
    // ordinary retune does not fail this on arrival, and rather than ten
    // because ten is not true: that was the first thing written here and it
    // failed, which is the only reason the real figure is in this comment.
    expect(overshoot / SETTLE_EPSILON).toBeGreaterThan(5);
  });

  it('still rejects the overshoot this spring actually produces', () => {
    expect(isAtRest(1 + overshoot)).toBe(false);
  });
});
