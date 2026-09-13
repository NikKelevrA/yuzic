/**
 * `resolveAlbumDetails` behind a `useQuery`, wired to the real
 * `metadata.enrich` broker — replaces the old fetcher-based
 * `useArtworkEnrichment` call for album covers with Phase 5's attributed
 * resolution.
 */
import { useQuery } from '@tanstack/react-query';
import { resolveAlbumDetails, type ResolvedAlbum } from './resolveAlbumDetails';
import { useMetadataEnrichmentBroker } from '@/providers/registry/enrichmentBroker';
import { QueryKeys } from '@/enums/queryKeys';
import type { Album } from '@/domain/entities/Album';

/** `null` while there is no album to resolve yet, or its resolution hasn't
 *  settled — callers fall back to the bare entity's own cover in the
 *  meantime, exactly as if enrichment were off. */
export function useAlbumDetails(album: Album | null): ResolvedAlbum | null {
  const broker = useMetadataEnrichmentBroker();

  const query = useQuery({
    queryKey: [
      QueryKeys.AlbumDetailsResolution,
      album?.localId ?? null,
      album?.cover.kind === 'none' ? 'none' : 'has-cover',
      broker.order?.join(',') ?? '',
    ],
    enabled: !!album,
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
    queryFn: () => {
      if (!album) throw new Error('unreachable: query disabled without an album');
      return resolveAlbumDetails({ album, broker });
    },
  });

  return query.data ?? null;
}
