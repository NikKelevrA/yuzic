import { useQuery, type QueryKey } from '@tanstack/react-query';

import { isUnavailableOnServer } from '@/features/library/useServerSurface';
import { useServerReachable } from './useServerReachable';

/**
 * A list that only the music server can supply — radio, podcasts, shares.
 *
 * These have no synced fallback, so `useOfflineFirstQuery` is not the right
 * tool: there is no local copy to fall back to, and the honest answer with the
 * server out of reach is an empty state saying so rather than a spinner that
 * resolves into a load failure. The three screens had each written the same
 * query out, and Radio's copy had lost two pieces of it — the retry guard
 * below, and the "not available on this server" state it goes with. A
 * Navidrome build with radio switched off therefore retried and then said
 * "couldn't load", which is a different and wrong answer.
 *
 * Asking the server for a surface it does not have is answered once, with a
 * 501, and asking again cannot change it — so that one error is not retried,
 * while an ordinary failure still gets its single retry.
 */
export function useServerOnlyQuery<T>(opts: {
  queryKey: QueryKey;
  /** The adapter call, absent when this server's protocol has no such surface. */
  list: (() => Promise<T[]>) | undefined;
  staleTime: number;
}) {
  const serverReachable = useServerReachable();

  return useQuery<T[]>({
    queryKey: opts.queryKey,
    queryFn: async () => (await opts.list?.()) ?? [],
    enabled: Boolean(opts.list) && serverReachable,
    staleTime: opts.staleTime,
    retry: (failures, error) => !isUnavailableOnServer(error) && failures < 1,
  });
}
