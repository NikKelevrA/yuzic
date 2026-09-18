/**
 * The arithmetic behind measuring the cover's landing slot.
 *
 * Kept out of the component because it is the part that is easy to get wrong
 * and impossible to see going wrong: an error here is a few points of offset
 * during one animation, which reads as the artwork "not quite settling"
 * rather than as a bug with a number attached.
 */

/**
 * How close to a resting point counts as resting.
 *
 * Not exactly zero or one, because a spring settles *through* its target
 * rather than onto it, and a rect stored at 0.9999 is as good as one stored
 * at 1. Deliberately smaller than `PLAYER_SPRING`'s overshoot (~0.8% of the
 * travel), so an overshooting spring reads as moving rather than as arrived.
 */
export const SETTLE_EPSILON = 0.001;

/**
 * Is the player at one of its two ends, rather than in flight between them?
 *
 * `expansion >= 1` is the tempting form and the wrong one: a spring with
 * `overshootClamping: false` passes 1 at its highest speed and keeps going,
 * so that test is satisfied for the whole of the overshoot — the exact window
 * in which a measurement is least trustworthy.
 */
export function isAtRest(expansion: number): boolean {
  // A worklet because its only production caller is a `useAnimatedReaction`
  // predicate, which runs on the UI thread — the same reason `coverScale` and
  // `canStartCoverSlide` next door are worklets. Without it the reaction has
  // to inline the expression, which is how the test below came to be pinning
  // a copy of the rule rather than the rule.
  'worklet';
  return Math.abs(expansion - 1) <= SETTLE_EPSILON || expansion <= SETTLE_EPSILON;
}

/**
 * Did the surface hold still between a measurement being asked for and the
 * answer arriving?
 *
 * `measureInWindow` answers a frame or more later. The position it reports
 * and the `expansion` read alongside it therefore describe two different
 * moments, and `restingSlotY` undoes the offset for exactly one of them — so
 * a measurement taken across any movement is skewed by the difference.
 */
export const measurementHeldStill = (askedAt: number, answeredAt: number): boolean =>
  Math.abs(answeredAt - askedAt) <= SETTLE_EPSILON;

/**
 * Where the slot sits with the player open and unscrolled, given where it was
 * seen and what the surface was doing at the time.
 *
 * The surface is translated down by `(1 - expansion) * windowHeight` while it
 * is closed, and the list under it may be scrolled; both are undone so the
 * stored rect always means the same thing whenever it was taken.
 */
export const restingSlotY = (
  y: number,
  expansion: number,
  windowHeight: number,
  scrollY: number,
): number => y - (1 - expansion) * windowHeight + scrollY;
