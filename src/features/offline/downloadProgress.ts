import { downloadProgressFraction } from './downloadPolicies';

/**
 * trackId → fraction in [0, 1], or -1 when the server streams without a
 * Content-Length (transcoded streams) and the total is unknown.
 */
export type DownloadProgressType = Record<string, number>;

export type DownloadProgress = ReturnType<typeof createDownloadProgress>;

/**
 * Live transfer progress, batched.
 *
 * The file download reports on every buffer written, which would redraw
 * every progress ring several times a second per track. Reports accumulate
 * and publish at most once per flush interval; clearing a finished track
 * publishes at once, so a ring never lingers after its download is done.
 */
export function createDownloadProgress(flushMs = 350) {
  let pending: DownloadProgressType = {};
  let published: DownloadProgressType = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const publish = () => {
    published = pending;
    listeners.forEach(listener => listener());
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: (): DownloadProgressType => published,

    report(trackId: string, written: number, expected: number) {
      pending = { ...pending, [trackId]: downloadProgressFraction(written, expected) };
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        publish();
      }, flushMs);
    },
    clear(trackId: string) {
      if (!(trackId in pending)) return;
      const { [trackId]: _finished, ...rest } = pending;
      pending = rest;
      publish();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
