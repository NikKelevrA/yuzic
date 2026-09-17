import type { SwipeOutcome } from './coverSwipe';

export type CoverSlideDirection = Exclude<SwipeOutcome, 'cancel'>;

/**
 * How big to draw the travelling cover, as the player opens.
 *
 * The eye reads a square by its area, not by its edge, and interpolating the
 * edge linearly makes the growth accelerate: halfway up the drag the cover has
 * taken barely a quarter of the area it will end up covering, so most of the
 * growth happens in the last third and the artwork appears to run away from
 * the finger near the top. Interpolating the area and taking the root back out
 * spends the growth evenly across the travel.
 *
 * Expressed as a scale against the size the cover is actually laid out at, so
 * the row of covers is positioned once and only ever scaled — and so the
 * cover and the corner radius that has to survive it agree about one number
 * rather than each deriving their own.
 */
export function coverScale(
  fromSize: number,
  toSize: number,
  expansion: number,
  referenceSize: number,
): number {
  'worklet';
  if (referenceSize <= 0) return 1;
  const t = expansion < 0 ? 0 : expansion > 1 ? 1 : expansion;
  const area = fromSize * fromSize + (toSize * toSize - fromSize * fromSize) * t;
  return Math.sqrt(area) / referenceSize;
}

/**
 * Whether playback has actually left the track the slide carried away.
 *
 * The row is re-centred on this answer alone, never on the animation having
 * finished: the player can refuse a skip it has already been asked for, and a
 * queue command reaches React asynchronously. Re-centring early would put the
 * outgoing cover back under the finger, which is the recoil this replaced.
 */
export function coverSlideSettled(
  outgoingSongId: string,
  currentSongId: string | undefined,
): boolean {
  return !!currentSongId && currentSongId !== outgoingSongId;
}

/** Whether the requested direction can actually select another queue item. */
export function canStartCoverSlide(
  direction: CoverSlideDirection,
  currentIndex: number,
  queueLength: number,
  repeatMode: 'off' | 'all' | 'one',
): boolean {
  // Called from the cover pan's UI-thread callback.
  'worklet';
  if (queueLength <= 0) return false;
  if (direction === 'previous') return currentIndex > 0;
  return currentIndex < queueLength - 1 || repeatMode === 'all';
}
