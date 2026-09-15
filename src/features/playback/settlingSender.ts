/**
 * Sends a value once it stops changing.
 *
 * A slider reports every step of a drag. A setting that lives on a server —
 * the jukebox's gain — should get the one the finger settled on, not a request
 * per step, and never an older step arriving after a newer one.
 */
export function createSettlingSender<T>(send: (value: T) => void, settleMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    push(value: T) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        send(value);
      }, settleMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
