import { useNetInfo } from '@react-native-community/netinfo';
import { QueryKey, useQueries, useQuery } from '@tanstack/react-query';
import { useServerUnreachable } from '@/features/connectivity/serverReachability';

export function hasArrayData<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

export function hasValue<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function selectOfflineFirstData<T>({
  queryData,
  fallbackData,
  hasFallbackData,
  preferFallbackWhenQueryEmpty = false,
}: {
  queryData: T | undefined;
  fallbackData: T;
  hasFallbackData: (value: T) => boolean;
  preferFallbackWhenQueryEmpty?: boolean;
}): T {
  if (queryData === undefined) return fallbackData;
  if (
    preferFallbackWhenQueryEmpty &&
    !hasFallbackData(queryData) &&
    hasFallbackData(fallbackData)
  ) {
    return fallbackData;
  }
  return queryData;
}

export function useOfflineFirstQuery<T>({
  queryKey,
  queryFn,
  enabled,
  staleTime,
  emptyValue,
  hasData,
  fallback,
}: {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  enabled: boolean;
  staleTime: number;
  /** Returned when neither `queryKey` nor any `fallback` source has cached data. */
  emptyValue: T;
  hasData: (value: T) => boolean;
  /**
   * Different, already-broader cache entries to derive this query's value
   * from when its own entry has never been populated — e.g. a single
   * album's detail query falling back to the albums *list* query (and the
   * tracks list, to rebuild its song list), for an album that's never been
   * opened online. Each source's `queryFn` is passed through for typing
   * only: `enabled: false` below means these observers never fetch
   * anything themselves, they only ever read what persistence hydrated or
   * what another mounted hook (the list screen, a background sync) already
   * put there. This read of the persisted query cache — not a second store
   * — is the entire offline fallback story now.
   */
  fallback?: {
    sources: { queryKey: QueryKey; queryFn: () => Promise<unknown> }[];
    select: (cached: (unknown | undefined)[]) => T | undefined;
  };
}) {
  const netInfo = useNetInfo();
  const isOffline =
    netInfo.isConnected === false ||
    netInfo.isInternetReachable === false;
  // Circuit breaker: once the server is known-unreachable (device online but
  // e.g. the VPN to it is down), stop issuing queries that would each hang
  // until their own timeout. ServerReachabilityWatcher clears the flag on the
  // first successful ping and invalidates, so these re-enable and refetch.
  const serverUnreachable = useServerUnreachable();

  const query = useQuery<T, Error>({
    queryKey,
    queryFn,
    enabled: enabled && !isOffline && !serverUnreachable,
    staleTime,
    networkMode: 'offlineFirst',
  });

  const fallbackSources = fallback?.sources ?? [];
  const fallbackQueries = useQueries({
    queries: fallbackSources.map(source => ({
      queryKey: source.queryKey,
      queryFn: source.queryFn,
      enabled: false,
      staleTime: Infinity,
    })),
  });

  const rawFallbackData = fallback
    ? fallback.select(fallbackQueries.map(q => q.data))
    : undefined;
  const hasFallback = rawFallbackData !== undefined && hasData(rawFallbackData);

  const data = selectOfflineFirstData({
    queryData: query.data,
    fallbackData: hasFallback ? (rawFallbackData as T) : emptyValue,
    hasFallbackData: hasData,
  });

  const hasPrimary = query.data !== undefined && hasData(query.data);
  const hasAnyData = hasPrimary || hasFallback;

  // Rendering (possibly stale) data because the server couldn't be asked —
  // offline, unreachable, or the fetch failed — rather than a confirmed-fresh
  // fetch. Screens whose data might be thinner than the real thing surface
  // this so cached data doesn't read as a bug.
  const degraded = hasAnyData && (isOffline || serverUnreachable || query.isError);

  return {
    data,
    isLoading: query.isLoading && !hasAnyData && !isOffline && !serverUnreachable,
    error: hasAnyData ? null : query.error ?? null,
    isOffline,
    serverUnreachable,
    degraded,
    query,
  };
}
