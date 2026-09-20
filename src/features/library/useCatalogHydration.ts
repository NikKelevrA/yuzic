/**
 * Puts the stored catalog back into the query cache at start.
 *
 * This is the half of `catalogPersistence` that used to be free: when the
 * catalog rode in the query persister's blob, `PersistQueryClientProvider`
 * restored it as part of restoring everything, and every catalog key was
 * populated before the first render. It was free in the sense that nobody had
 * to write it, and expensive in every other sense — the whole library was
 * parsed ahead of first paint, so a large one held the splash screen for
 * seconds.
 *
 * So the restore is spelled out here instead, and it differs in two ways that
 * are the entire point:
 *
 * - **It happens once the thread is idle** (`requestIdleCallback`), so the app
 *   is on screen and taking touches while the library arrives. A screen
 *   reading a resource that has not landed yet sees the same empty cache it
 *   sees before a first sync, which every catalog hook already renders as
 *   loading. The `timeout` is what stops "idle" meaning "never" on a busy
 *   start: past it the work runs anyway.
 * - **It goes one resource at a time, tracks last**, yielding between each.
 *   Tracks is far the largest — at 80k songs it is most of the library's
 *   bytes on its own — and hydrating it first meant albums, artists and
 *   playlists, which is everything Home and Library draw, waited behind the
 *   one list neither of them reads.
 *
 * Nothing here overwrites data: a sync that has already filled a key wins,
 * checked both before the read and after it, since a sync can land in the
 * yield between two resources.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import { CATALOG_RESOURCES } from './catalogQueries';
import { readCatalogResource } from './catalogPersistence';

/**
 * Cheapest first. `CATALOG_RESOURCES` is ordered for reading as a table; this
 * is ordered for the one property that matters at start, which is how long a
 * resource blocks the ones behind it.
 */
const HYDRATION_ORDER = [...CATALOG_RESOURCES].sort(
  (left, right) => Number(left.name === 'tracks') - Number(right.name === 'tracks')
);

/** Lets the JS thread service a touch between two resources. */
const yieldToUi = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * How long "idle" is allowed to mean "not yet".
 *
 * A start busy enough never to go idle is exactly the start that most needs
 * its library, so the timeout is what turns a hint into a promise.
 */
const HYDRATION_IDLE_TIMEOUT_MS = 2_000;

/**
 * Runs `work` off the current tick, and returns how to call it off.
 *
 * `requestIdleCallback` is a global React Native installs in
 * `InitializeCore`, so the app always has one. The test runner loads neither
 * that nor a DOM, and a hook that throws `ReferenceError` under Jest is a hook
 * nobody can test — hence the fallback, which keeps the only property the
 * caller depends on: not this tick.
 */
function scheduleWhenIdle(work: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(work, { timeout: HYDRATION_IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(work, 0);
  return () => clearTimeout(handle);
}

export function useCatalogHydration(): void {
  const queryClient = useQueryClient();
  const serverId = useSelector(selectActiveServerId);

  useEffect(() => {
    if (!serverId) return;

    let cancelled = false;

    const hydrate = async () => {
      for (const resource of HYDRATION_ORDER) {
        if (cancelled) return;

        const queryKey = resource.queryKey(serverId);
        // A sync got there first — its copy is the fresh one.
        if (queryClient.getQueryData(queryKey) !== undefined) continue;

        const stored = readCatalogResource(serverId, resource.name);
        if (stored === undefined) continue;

        // Checked again: the read above is synchronous, but the yield at the
        // bottom of the previous pass was not.
        if (cancelled) return;
        if (queryClient.getQueryData(queryKey) === undefined) {
          queryClient.setQueryData(queryKey, stored);
        }

        await yieldToUi();
      }
    };

    const unschedule = scheduleWhenIdle(() => {
      void hydrate();
    });

    return () => {
      cancelled = true;
      unschedule();
    };
  }, [queryClient, serverId]);
}
