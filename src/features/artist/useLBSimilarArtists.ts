import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { fetchSimilarArtistsFromListeners, LISTENERS_SIMILAR_USE } from '@/providers/registry/homeDiscovery';
import { QueryKeys } from '@/state/query/queryKeys';
import { selectSourceUse } from '@/features/settings/sources/state';
import type { Artist } from '@/domain/entities/Artist';

/**
 * Similar-artists from ListenBrainz's public session-based graph. Keyed on
 * MBID (no user auth required), so connecting an account is not what turns it
 * on — the ListenBrainz discovery setting is, and it is off until the user
 * asks. Skipped when the seed artist has no MBID: LB has nothing to match on.
 */
export function useLBSimilarArtists(
  seed: { mbid?: string | null; excludeName?: string } | null,
  limit = 12
) {
  const discoveryEnabled = useSelector(selectSourceUse(LISTENERS_SIMILAR_USE));
  const mbid = seed?.mbid ?? null;
  const excludeName = seed?.excludeName;

  const queryKey = useMemo(
    () => [QueryKeys.SimilarArtists, 'listeners', mbid ?? '', limit],
    [mbid, limit]
  );

  return useQuery<Artist[]>({
    queryKey,
    queryFn: () => fetchSimilarArtistsFromListeners(mbid!, limit, excludeName),
    enabled: discoveryEnabled && Boolean(mbid),
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
  });
}
