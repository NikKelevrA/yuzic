/**
 * `resolveArtistDetails` behind a `useQuery`, wired to the real
 * `metadata.enrich` broker: one attributed resolution for an artist's
 * biography and cover.
 */
import { useQuery } from '@tanstack/react-query';
import { resolveArtistDetails, type ResolvedArtist } from './resolveArtistDetails';
import { useMetadataEnrichmentBroker } from '@/providers/registry/enrichmentBroker';
import { QueryKeys } from '@/state/query/queryKeys';
import type { Artist } from '@/domain/entities/Artist';

/** `null` while there is no artist to resolve yet, or its resolution hasn't
 *  settled — callers fall back to the bare entity's own fields in the
 *  meantime, exactly as if enrichment were off, so nothing ever flashes a
 *  wrong or stale attributed value ahead of the real result. */
export function useArtistDetails(artist: Artist | null): ResolvedArtist | null {
  const broker = useMetadataEnrichmentBroker();

  const query = useQuery({
    queryKey: [
      QueryKeys.ArtistDetailsResolution,
      artist?.localId ?? null,
      artist?.biography ?? null,
      artist?.cover.kind === 'none' ? 'none' : 'has-cover',
      broker.order?.join(',') ?? '',
    ],
    enabled: !!artist,
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
    queryFn: () => {
      if (!artist) throw new Error('unreachable: query disabled without an artist');
      return resolveArtistDetails({ artist, broker });
    },
  });

  return query.data ?? null;
}
