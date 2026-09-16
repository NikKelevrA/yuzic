import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useApi } from '@/providers/registry/useApi';
import { useAppActive } from '@/features/connectivity/useAppActive';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { usePollWhile } from '@/state/query/usePollWhile';
import { useSync } from '@/features/library/useSync';
import { useDownloaderStates, type DownloaderState } from './registry';
import { finishedSince, type DownloaderQueueItem } from './queueItem';
import type { DownloaderId } from '@/state/redux/slices/downloadersSlice';

// A completed download on a downloader (Lidarr/slskd) writes to the media
// library the same way a manual copy would — the server has no way to know
// until it scans. This poll interval balances "the new album shows up
// promptly" against "we're not hammering an idle downloader all day".
const POLL_INTERVAL_MS = 30_000;

// Some scans take a while on large libraries (multi-thousand album Navidrome
// installs). Refetch a second time later so a slow scan doesn't leave the app
// with a stale library.
const SYNC_DELAYS_MS = [15_000, 60_000];

type DownloaderQueueSnapshot = {
  id: DownloaderId;
  label: string;
  /** Everything currently queued. Empty is a real answer, not "unread". */
  items: DownloaderQueueItem[];
  count: number;
  /** True only until the first read lands, so a list does not flash a spinner. */
  isLoading: boolean;
  /** The last read failed. The items above are then the previous good read. */
  hasError: boolean;
};

type ContextValue = {
  /** One entry per connected downloader, queued or not. */
  queues: DownloaderQueueSnapshot[];
  /** Total items across all connected downloaders. */
  totalInFlight: number;
  /** Items that left a queue since the last read, for whoever wants to react. */
  recentlyFinished: DownloaderQueueItem[];
  /**
   * Read every connected downloader again, now.
   *
   * The poll is on a 30-second interval, which is right for a background
   * count and far too long to watch after asking for something. This is the
   * same read the interval performs, not a second one — an in-flight
   * downloader is skipped rather than asked twice.
   */
  refresh: () => void;
};

const DownloadersQueueContext = createContext<ContextValue>({
  queues: [],
  totalInFlight: 0,
  recentlyFinished: [],
  refresh: () => {},
});

/**
 * The single background poller for every connected downloader.
 *
 *   1. Detect completions — items that disappeared since the last read — and
 *      trigger a server rescan plus a forced library sync. A downloader that
 *      finishes writes into the library the way a manual copy would, and the
 *      media server has no idea until it looks.
 *   2. Expose the whole queue per downloader, so every surface that wants to
 *      know what is transferring reads one snapshot instead of opening its own
 *      connection to the same server.
 *
 * The second job is why this is the only poller left. There were three: this
 * one at 30s for counts, the settings screen's at 10s for its cards, and a
 * React Query pair at 12s per album row for progress — three reads of the same
 * endpoints, three intervals, and three separate ideas of what "finished"
 * meant. A downloader saw up to three times the traffic it needed, and which
 * of the three noticed a completion first decided whether the library got
 * rescanned.
 *
 * Mounted once at the top of the home layout.
 */
export function DownloadersQueueProvider({ children }: { children: ReactNode }) {
  const states = useDownloaderStates();
  const api = useApi();
  const { sync } = useSync();
  const isAppActive = useAppActive();
  const isOffline = useIsOffline();

  const [queues, setQueues] = useState<DownloaderQueueSnapshot[]>([]);

  const [recentlyFinished, setRecentlyFinished] = useState<DownloaderQueueItem[]>([]);

  // One previous-queue ref per downloader id — a Map, so add/remove
  // downloaders don't shift indices under an in-flight poll.
  const previousQueuesRef = useRef<Map<DownloaderId, DownloaderQueueItem[]>>(new Map());
  const inFlightRef = useRef<Set<DownloaderId>>(new Set());

  const connectedStates = useMemo(() => states.filter((s) => s.isConnected), [states]);
  const shouldPoll = connectedStates.length > 0 && isAppActive && !isOffline;
  const tick = usePollWhile(shouldPoll, POLL_INTERVAL_MS);

  /**
   * Replace one downloader's entry, keeping the rest.
   *
   * Every connected downloader keeps an entry whether or not anything is
   * queued — an empty queue is a real answer, and dropping the row for one
   * made "nothing is transferring" indistinguishable from "not read yet",
   * which is what a card needs to tell apart to stop flashing its spinner.
   */
  const updateQueue = useCallback((
    state: DownloaderState,
    patch: Partial<DownloaderQueueSnapshot>
  ) => {
    setQueues((prev) => {
      const existing = prev.find((q) => q.id === state.def.id);
      const next: DownloaderQueueSnapshot = {
        id: state.def.id,
        label: state.def.label,
        items: existing?.items ?? [],
        count: existing?.count ?? 0,
        isLoading: existing?.isLoading ?? true,
        hasError: existing?.hasError ?? false,
        ...patch,
      };
      return [...prev.filter((q) => q.id !== state.def.id), next];
    });
  }, []);

  const pollOne = useCallback(async (state: DownloaderState) => {
    if (inFlightRef.current.has(state.def.id)) return;
    inFlightRef.current.add(state.def.id);
    const previous = previousQueuesRef.current.get(state.def.id) ?? [];
    try {
      const items = await state.def.fetchQueue(state.config);
      const finished = finishedSince(previous, items);
      previousQueuesRef.current.set(state.def.id, items);
      updateQueue(state, {
        items,
        count: items.length,
        isLoading: false,
        hasError: false,
      });
      if (finished.length > 0) {
        setRecentlyFinished(finished);
        // Ask the server to look, then read the library again — twice, because
        // a scan of a multi-thousand album library is not instant and a single
        // early refetch would find the same catalogue it already had.
        api.auth.startScan().catch(() => {});
        for (const delay of SYNC_DELAYS_MS) {
          setTimeout(() => { void sync(true).catch(() => {}); }, delay);
        }
      }
    } catch {
      // Transient reachability failure. The previous items stay: showing an
      // empty queue because one read failed would look like every transfer
      // had finished.
      updateQueue(state, { isLoading: false, hasError: true });
    } finally {
      inFlightRef.current.delete(state.def.id);
    }
  }, [api.auth, sync, updateQueue]);

  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    for (const state of connectedStates) {
      if (cancelled) break;
      void pollOne(state);
    }
    return () => { cancelled = true; };
  }, [shouldPoll, tick, connectedStates, pollOne]);

  // Clean up snapshots for downloaders that got disconnected.
  useEffect(() => {
    const connectedIds = new Set(connectedStates.map((s) => s.def.id));
    // Return `prev` untouched when nothing was dropped: `filter` always
    // allocates, and a new array here re-runs this effect via the state
    // update it causes.
    setQueues((prev) => {
      const next = prev.filter((q) => connectedIds.has(q.id));
      return next.length === prev.length ? prev : next;
    });
    for (const id of Array.from(previousQueuesRef.current.keys())) {
      if (!connectedIds.has(id)) previousQueuesRef.current.delete(id);
    }
  }, [connectedStates]);

  const refresh = useCallback(() => {
    for (const state of connectedStates) void pollOne(state);
  }, [connectedStates, pollOne]);

  const value = useMemo<ContextValue>(() => ({
    queues,
    totalInFlight: queues.reduce((sum, q) => sum + q.count, 0),
    recentlyFinished,
    refresh,
  }), [queues, recentlyFinished, refresh]);

  return (
    <DownloadersQueueContext.Provider value={value}>
      {children}
    </DownloadersQueueContext.Provider>
  );
}

export function useDownloadersQueue(): ContextValue {
  return useContext(DownloadersQueueContext);
}
