import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import type { RootState } from '@/state/redux/store';
import {
  seedFromLegacyCounts,
  type LegacyCounts,
} from '@/state/redux/slices/listeningSlice';

/**
 * Carry the play counters this replaced into the listening log, once.
 *
 * `statsSlice` used to keep four local tallies — songs, albums, artists and
 * playlists — written by `incrementPlay`. They are gone from its type, but not
 * from anybody's device: redux-persist rehydrates whatever was stored, so for
 * every existing install those maps are still sitting in the slice at runtime
 * under keys nothing reads any more.
 *
 * Reading them here is the only chance to keep them. Songs and albums would
 * survive without it, because the server has its own counts and a sync brings
 * them back — **artists and playlists would not.** Neither Subsonic nor
 * Jellyfin reports either, so those tallies are the only copy that has ever
 * existed, and dropping them would empty the ranking behind Home's shelves and
 * the figures on an artist's options sheet for every existing user, on the
 * update whose entire purpose is to take their listening seriously.
 *
 * Runs after rehydration because it reads rehydrated state, and once because
 * the reducer records that it has. There is nothing to undo if it runs early
 * on a fresh install: the maps are absent, the seed is empty, and the flag is
 * set.
 */
const counts = (
  plays: Record<string, number> | undefined,
  lastPlayedAt: Record<string, number> | undefined,
): LegacyCounts | undefined =>
  plays && Object.keys(plays).length > 0 ? { plays, lastPlayedAt: lastPlayedAt ?? {} } : undefined;

export function useLegacyStatsMigration(): void {
  const dispatch = useDispatch();
  const seeded = useSelector((state: RootState) => state.listening.legacySeeded);
  // `StatsState` still declares these, marked as legacy — see the comment
  // there. They are read exactly here, once, and never written by anything.
  const legacy = useSelector((state: RootState) => state.stats);

  useEffect(() => {
    if (seeded) return;
    dispatch(seedFromLegacyCounts({
      tracks: counts(legacy.songPlays, legacy.songLastPlayedAt),
      albums: counts(legacy.albumPlays, legacy.albumLastPlayedAt),
      artists: counts(legacy.artistPlays, legacy.artistLastPlayedAt),
      playlists: counts(legacy.playlistPlays, legacy.playlistLastPlayedAt),
    }));
  }, [seeded, legacy, dispatch]);
}
