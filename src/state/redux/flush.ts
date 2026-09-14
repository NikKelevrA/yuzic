/**
 * Write every pending persisted Redux change to disk now.
 *
 * redux-persist batches writes (the playback slice every 3 s, stats every
 * 1 s), which is right for the steady stream of ticks and wrong for the few
 * moments where the latest value is the whole point: a pause, where a kill a
 * second later would restore the position from before it, and the end of a
 * catalog sync, whose timestamp must not reach disk ahead of its data.
 *
 * Required lazily so importing this does not start redux-persist — hooks and
 * tests that bring their own store can use it without it.
 */
export function flushPersistedState(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { persistor } = require('./persistor') as typeof import('./persistor');
  return persistor.flush();
}
