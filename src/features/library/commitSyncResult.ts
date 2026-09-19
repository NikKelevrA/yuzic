import { setServerAlbumStats, setServerSongStats } from '@/state/redux/slices/statsSlice';
import { clearServerRatings } from '@/state/redux/slices/ratingsSlice';
import { setLastSyncedAt } from '@/features/settings/sync/state';
import type { CatalogSyncResult } from './catalogSync';

type Dispatch = (action: { type: string; payload?: unknown }) => unknown;

/**
 * Writes what a sync found, then — only once that is on disk — records that
 * the sync happened.
 *
 * The order is the whole point. `stats` persists on a one-second throttle,
 * `lastSyncedAt` did not, and both were dispatched in the same tick: an app
 * killed inside that second came back with a fresh "last synced" and no play
 * stats. The sync throttle then trusted the timestamp and skipped the relaunch
 * sync, so Quick picks and Recents stayed empty for half an hour. Flushing the
 * stats before the timestamp is written means a kill at any point leaves the
 * timestamp behind the data, never ahead of it — the worst case is one extra
 * sync.
 *
 * Each server map replaces that server's whole namespace, so an empty list is
 * dispatched as nothing: an origin that reports no play counts must not wipe
 * locally tracked ones.
 */
export async function commitSyncResult({
  dispatch,
  flush,
  serverId,
  result,
  now = Date.now,
}: {
  dispatch: Dispatch;
  /** Resolves once pending persisted state is written — `persistor.flush`. */
  flush: () => Promise<unknown>;
  serverId: string;
  result: CatalogSyncResult;
  now?: () => number;
}): Promise<number | null> {
  if (result.albumStats.length > 0) {
    dispatch(setServerAlbumStats({ serverId, stats: result.albumStats }));
  }
  if (result.songStats.length > 0) {
    dispatch(setServerSongStats({ serverId, stats: result.songStats }));
  }
  if (!result.hasData) return null;

  // The catalog just came back carrying the server's own ratings, so the
  // overlay of the ones this device wrote has nothing left to add — see
  // `ratingsSlice`. Only on a run that actually returned data: a sync that
  // found nothing has not replaced anything, and dropping the overlay after
  // one would show the user's own ratings disappearing.
  dispatch(clearServerRatings(serverId));

  await flush();
  const syncedAt = now();
  dispatch(setLastSyncedAt({ serverId, at: syncedAt }));
  return syncedAt;
}
