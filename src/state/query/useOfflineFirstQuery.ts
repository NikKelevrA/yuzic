import { useRef } from 'react';
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

  // Both values below are handed to every memo and effect keyed on this hook's
  // `data`, so each has to be the same object until its content changes.
  //
  // `emptyValue` is almost always a literal (`[]`) written at the call site — a
  // new object every render. Returned as-is, "nothing cached" read as "the data
  // changed" on every render, and a consumer that copies derived state in an
  // effect looped: `PlaylistList`, mounted by the playing bar, threw "Maximum
  // update depth exceeded" whenever the catalog was empty, and nothing else on
  // screen got to render. The first one is kept.
  const emptyRef = useRef(emptyValue);

  // `select` builds a new value each time it runs, so it runs again only when a
  // source's cached data actually changes.
  const fallbackDatas = fallbackQueries.map(q => q.data);
  const fallbackMemo = useRef<{ datas: unknown[]; value: T | undefined } | null>(null);
  if (
    !fallbackMemo.current ||
    fallbackMemo.current.datas.length !== fallbackDatas.length ||
    fallbackMemo.current.datas.some((cached, i) => cached !== fallbackDatas[i])
  ) {
    fallbackMemo.current = {
      datas: fallbackDatas,
      value: fallback ? fallback.select(fallbackDatas) : undefined,
    };
  }
  const rawFallbackData = fallbackMemo.current.value;
  const hasFallback = rawFallbackData !== undefined && hasData(rawFallbackData);

  const data = selectOfflineFirstData({
    queryData: query.data,
    fallbackData: hasFallback ? (rawFallbackData as T) : emptyRef.current,
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
