import type { CoverSource } from '@/domain/entities/Cover';
import type { Song } from '@/domain/entities/Song';
import { canStartCoverSlide } from './coverTransition';

/** The artwork on either side of the playing track, as the swipe will reach it. */
type CoverNeighbours = {
  previous: CoverSource | null;
  next: CoverSource | null;
};

/**
 * Which track a swipe in each direction would land on.
 *
 * Asked through `canStartCoverSlide` rather than by indexing the queue
 * directly, so the artwork the finger drags into view is the artwork the skip
 * actually selects. The two answers drifting apart is worse than either being
 * wrong on its own: the cover slides in, playback refuses the move, and the
 * carousel snaps back to a picture the user watched it leave.
 */
export function coverNeighbours(
  queue: readonly Song[],
  currentIndex: number,
  repeatMode: 'off' | 'all' | 'one',
): CoverNeighbours {
  const canGo = (direction: 'next' | 'previous') =>
    canStartCoverSlide(direction, currentIndex, queue.length, repeatMode);

  // Repeat-all is the one case where the neighbour is not the adjacent index:
  // the end of the queue is followed by its start, which is exactly the move
  // `canStartCoverSlide` allows there.
  const nextIndex = currentIndex + 1 < queue.length ? currentIndex + 1 : 0;

  return {
    previous: canGo('previous') ? queue[currentIndex - 1]?.cover ?? null : null,
    next: canGo('next') ? queue[nextIndex]?.cover ?? null : null,
  };
}
