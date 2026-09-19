import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '@/state/redux/store';
import type { EntityTotals } from '@/state/redux/slices/listeningSlice';
import { type ListenEnding } from './listeningEvent';
import {
  affinity,
  dormancy,
  dormancyReason,
  rankBy,
  type DormancyReason,
} from './listeningAffinity';
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

/**
 * Enough listening to be worth drawing.
 *
 * Below this the screen says so instead of showing a clock face with two
 * marks on it and a "top artist" with one play. A statistic drawn from
 * almost nothing is not a small statistic, it is a misleading one, and this
 * audience will check.
 */
const ENOUGH_EVENTS = 20;

export function useListeningStats(now: number = Date.now()): ListeningStats {
  const events = useSelector((state: RootState) => state.listening.events);
  const totals = useSelector((state: RootState) => state.listening.totals);

  return useMemo(() => {
    const entries: (EntityTotals & { key: string })[] = Object.entries(totals).map(
      ([key, entry]) => ({ key, ...entry }),
    );

    const endings: Record<ListenEnding, number> = {
      finished: 0,
      skipped: 0,
      interrupted: 0,
    };
    for (const event of events) endings[event.ending] += 1;

    const favourites = rankBy(entries, entry => affinity(entry, now), SHELF).map(entry => ({
      key: entry.key,
      plays: entry.plays,
      seconds: entry.seconds,
    }));

    const forgotten = rankBy(entries, entry => dormancy(entry, now), SHELF).map(entry => ({
      key: entry.key,
      reason: dormancyReason(entry, now),
    }));

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
      hasHistory: events.length >= ENOUGH_EVENTS,
    };
  }, [events, totals, now]);
}
