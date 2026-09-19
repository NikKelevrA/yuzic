import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '@/state/redux/store';
import { type ListenEnding } from './listeningEvent';
import type { DormancyReason } from './listeningAffinity';
import { useListenerModel } from './useListenerModel';
import {
  averageCompletion,
  firstHeardIn,
  lifetimeTotals,
  listeningStreak,
  summarise,
  type ListeningSummary,
  type Tally,
} from './listeningSummary';

/**
 * Everything the listening screen shows, derived in one pass.
 *
 * One hook rather than several because every figure comes from the same two
 * arrays, and reading them separately would walk the log once per number. The
 * whole thing is `useMemo`'d against the slice, so it recomputes when a track
 * change writes an event and not otherwise.
 *
 * Nothing here resolves a name. The log stores `serverId:entityId` keys, and
 * turning those into titles is the screen's job through the catalog — which
 * keeps this hook free of the query layer and keeps a missing track (deleted
 * from the server, or from another server entirely) a rendering decision
 * rather than a hole in the arithmetic.
 */

/** A track the listener used to play and has stopped. */
export interface ForgottenTrack {
  key: string;
  reason: DormancyReason;
}

export interface ListeningStats {
  /** All time, from the rollups — safe to label as such. */
  lifetime: ReturnType<typeof lifetimeTotals>;
  /** The last 30 days, from the event ring. */
  recent: ListeningSummary;
  /** Everything the ring still holds. */
  window: ListeningSummary;
  streak: number;
  completion: number;
  /** How listens ended, across the ring. */
  endings: Record<ListenEnding, number>;
  /** Tracks first heard in the last 30 days. */
  discovered: string[];
  /** Most-played right now, recency-weighted. */
  favourites: Tally[];
  /** Loved once, not played in a long time. */
  forgotten: ForgottenTrack[];
  /** False when there is not yet enough history to say anything. */
  hasHistory: boolean;
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const SHELF = 10;


export function useListeningStats(now: number = Date.now()): ListeningStats {
  const events = useSelector((state: RootState) => state.listening.events);
  const totals = useSelector((state: RootState) => state.listening.totals);
  // The same model autoplay and Smart Shuffle ask. A screen that ranked by its
  // own formula would be a second opinion about this listener, visible right
  // next to the first.
  const listener = useListenerModel();

  return useMemo(() => {
    const keys = Object.keys(totals);

    const endings: Record<ListenEnding, number> = {
      finished: 0,
      skipped: 0,
      interrupted: 0,
    };
    for (const event of events) endings[event.ending] += 1;

    const key = (k: string) => k;
    const favourites = listener
      .order(keys, key, 'favourite', { limit: SHELF })
      .map(k => ({ key: k, plays: totals[k].plays, seconds: totals[k].seconds }));

    const forgotten = listener
      .order(keys, key, 'rediscover', { limit: SHELF })
      .map(k => ({ key: k, reason: listener.reasonFor(k) }));

    return {
      lifetime: lifetimeTotals(totals),
      recent: summarise(events, { since: now - MONTH_MS, limit: SHELF }),
      window: summarise(events, { limit: SHELF }),
      streak: listeningStreak(events, now),
      completion: averageCompletion(events),
      endings,
      discovered: firstHeardIn(totals, now - MONTH_MS),
      favourites,
      forgotten,
      hasHistory: listener.informed,
    };
  }, [events, totals, now, listener]);
}
