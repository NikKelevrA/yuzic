import { useRef, type MutableRefObject } from 'react';

/**
 * A ref holding this render's value.
 *
 * For controllers built once and kept stable for context consumers, which
 * still have to act on the current setting, sink or callback when they run.
 * Assigned during render rather than in an effect: an effect declared earlier
 * in the tree would otherwise read the previous value on the very render the
 * value changed — the restore-on-launch bug that called a placeholder
 * `loadQueue` and silently did nothing came from exactly that ordering.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
