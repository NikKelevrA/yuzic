import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { getLBSimilarArtists } from '@/providers/integration/listenbrainz';
import { QueryKeys } from '@/state/query/queryKeys';
import { selectListenbrainzDiscoveryEnabled } from '@/features/settings/home/state';
import type { Artist } from '@/domain/entities/Artist';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';

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
  const discoveryEnabled = useSelector(selectListenbrainzDiscoveryEnabled);
  const mbid = seed?.mbid ?? null;
  const excludeName = seed?.excludeName?.trim().toLowerCase();

  const queryKey = useMemo(
    () => [QueryKeys.SimilarArtists, 'listenbrainz', mbid ?? '', limit],
    [mbid, limit]
  );

  return useQuery<Artist[]>({
    queryKey,
    queryFn: async () => {
      const raw = await getLBSimilarArtists(mbid!, limit);
      const provenance = integrationProvenance('listenbrainz');
      return raw
        .filter((a) => !excludeName || a.name.trim().toLowerCase() !== excludeName)
        .map((a): Artist => ({
          localId: makeLocalId('artist', provenance, a.artistMbid),
          // ListenBrainz's similar-artists graph is keyed entirely on MBID —
          // it names no artist id of its own — so the MBID doubles as
          // `nativeId` here rather than leaving it blank.
          nativeId: a.artistMbid,
          provenance,
          externalIds: { mbid: a.artistMbid },
          libraryState: 'external',
          name: a.name,
          cover: { kind: 'none' },
          tags: [],
          albumIds: [],
        }));
    },
    enabled: discoveryEnabled && Boolean(mbid),
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
  });
}
