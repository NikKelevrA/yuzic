/**
 * How the queue advances, and in what order.
 *
 * Domain types rather than context types. They lived inside
 * `PlayingContext.tsx`, which meant `playbackSlice.ts` imported a React
 * context module to name the value it persists — closing a cycle back through
 * the store, and making a Redux slice depend on the component tree. Twenty-six
 * of the app's twenty-eight import cycles ran through that one edge.
 */

/** What happens when the queue reaches the end, or a track finishes. */
export type RepeatModeState = 'off' | 'all' | 'one';

/**
 * How the next track is chosen. `smart` differs from `shuffle` in where the
 * tracks come from, not just their order: it extends the queue from a
 * similarity provider rather than permuting what is already there.
 */
export type ShuffleMode = 'off' | 'shuffle' | 'smart';
