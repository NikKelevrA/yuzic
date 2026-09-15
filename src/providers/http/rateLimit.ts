/**
 * Spaces calls to one remote API so a burst never exceeds its published rate.
 *
 * Integration APIs rate-limit per client, and typing into search is a burst by
 * nature: every pause in the keystrokes starts a request. MusicBrainz allows
 * one request per second and answers anything faster with 503; Deezer allows
 * fifty per five seconds and answers the excess with a 200 carrying an error
 * body. Past either limit the search came back empty or failed outright — the
 * "invalid search" that fast typing produced.
 *
 * Calls run in the order they were scheduled, each starting no sooner than
 * `minIntervalMs` after the previous one started. A call whose `signal` has
 * been aborted by the time its turn comes is skipped without spending a slot,
 * which is what lets a superseded search drop out of the line instead of
 * holding up the one the user is actually waiting for.
 */
export class RateLimitAbortError extends Error {
  constructor() {
    super('Request was superseded before it ran');
    this.name = 'RateLimitAbortError';
  }
}

type RateLimiter = <T>(run: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

export function createRateLimiter(
  minIntervalMs: number,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): RateLimiter {
  let lastStart = -Infinity;
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    const turn = tail.then(async () => {
      if (signal?.aborted) throw new RateLimitAbortError();
      const delay = lastStart + minIntervalMs - now();
      if (delay > 0) await wait(delay);
      if (signal?.aborted) throw new RateLimitAbortError();
      lastStart = now();
      return run();
    });
    // The line advances whether this call succeeded or not.
    tail = turn.catch(() => undefined);
    return turn;
  };
}
