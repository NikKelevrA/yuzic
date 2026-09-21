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
 * - **Tracks waits for a running sync**, which is the difference between one
 *   copy of the library in memory and two. See `whenSyncSettles`.
 *
 * Nothing here overwrites data: a sync that has already filled a key wins,
 * checked both before the read and after it, since a sync can land in the
 * yield between two resources.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import { CATALOG_RESOURCES, catalogSyncKey } from './catalogQueries';
import { readCatalogResource } from './catalogPersistence';
import { shareIdenticalParts } from './shareIdenticalParts';

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
 * Which server's stored catalog has had its chance to load.
 *
 * The catalog hooks wait on this before they will fetch, through
 * `useCatalogHydrated`. Without it a cold start downloads the whole library
 * every time: the screens mount, find their cache entries empty — hydration
 * runs on idle, after first paint, which is the entire point of it — and each
 * one starts a full paged fetch of a library the device already has on disk.
 *
 * So the stored copy and the fetched copy end up in memory together, which at
 * 90,000 tracks is the crash; and on a phone it is also the whole library over
 * mobile data on every launch, which is its own bug.
 *
 * A module-level value with subscribers rather than a context, for the same
 * reason the store cache is one: nothing sits above every caller, and this is
 * one fact owned by a hook that is mounted once. Keyed by server so switching
 * to another one waits for *its* catalog rather than reading the last one's
 * answer.
 */
let hydratedFor: string | null = null;
const listeners = new Set<() => void>();

function announce(serverId: string | null): void {
  if (hydratedFor === serverId) return;
  hydratedFor = serverId;
  for (const listener of [...listeners]) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Whether the stored catalog for this server has been given its chance.
 *
 * True without a server, because there is then nothing to wait for and the
 * callers are disabled on that anyway.
 */
export function useCatalogHydrated(serverId: string | undefined): boolean {
  const settled = useSyncExternalStore(subscribe, () => hydratedFor);
  return !serverId || settled === serverId;
}

/** For tests: forget what has been hydrated so one case cannot leak into the next. */
export function _resetCatalogHydration(): void {
  hydratedFor = null;
  listeners.clear();
}

/**
 * Resolves once no catalog sync is running for this server.
 *
 * Only the tracks list waits on this, and it is the difference between one
 * copy of the library in memory and two. A start that is going to sync ends
 * up with the server's copy either way; reading the stored one first means
 * holding both while the fetch runs, and at 90,000 tracks that is what
 * aborted Hermes. The small resources do not wait, because they are what
 * Home and Library paint with and they cost a few megabytes.
 *
 * Waiting rather than skipping is what keeps the offline story intact: if the
 * sync fails, or fails for tracks alone, the cache is still empty afterwards
 * and the stored copy goes in as it always did.
 *
 * No timeout, deliberately. A sync settles by construction — every request
 * carries its own timeout and the page walk is bounded — so a deadline here
 * would only be a second, wronger answer to "is it still going", and the one
 * case it would fire in is the one where holding two libraries is fatal. The
 * effect's cleanup is the way out.
 */
function whenSyncSettles(queryClient: QueryClient, serverId: string): Promise<void> {
  const filters = { mutationKey: catalogSyncKey(serverId) };
  if (queryClient.isMutating(filters) === 0) return Promise.resolve();

  return new Promise(resolve => {
    const unsubscribe = queryClient.getMutationCache().subscribe(() => {
      if (queryClient.isMutating(filters) > 0) return;
      unsubscribe();
      resolve();
    });
  });
}

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
    if (!serverId) {
      announce(null);
      return;
    }

    let cancelled = false;
    // A different server's catalog is a different question, and the answer
    // for the last one must not let this one's screens fetch early.
    if (hydratedFor !== serverId) announce(null);

    const hydrate = async () => {
      for (const resource of HYDRATION_ORDER) {
        if (cancelled) return;

        // The whale waits out a running sync rather than sitting in memory
        // next to what replaces it. Last in the order, so nothing waits on it.
        if (resource.name === 'tracks') {
          await whenSyncSettles(queryClient, serverId);
          if (cancelled) return;
        }

        const queryKey = resource.queryKey(serverId);
        // A sync got there first — its copy is the fresh one.
        if (queryClient.getQueryData(queryKey) !== undefined) continue;

        // Shared before it reaches the cache: parsed JSON has one copy of every
        // repeated part per entity — see `shareIdenticalParts`.
        const stored = shareIdenticalParts(readCatalogResource(serverId, resource.name));
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
      // Announced whatever happened, including a read that threw: a catalog
      // hook that never hears is a library that never loads, which is a worse
      // failure than the one this gate exists to prevent.
      void hydrate().finally(() => {
        if (!cancelled) announce(serverId);
      });
    });

    return () => {
      cancelled = true;
      unschedule();
    };
  }, [queryClient, serverId]);
}
