import { useQuery } from '@tanstack/react-query';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { QueryKeys } from '@/enums/queryKeys';
import { fetchPreviewsForExternalAlbum } from './previewUtils';
import { useDeezerDiscoveryEnabled } from '@/features/home/hooks/useDeezerEnabled';

/**
 * Clip URLs for an album's tracks, keyed by each track's `nativeId`.
 *
 * Tracks are passed alongside the album rather than read off it: an `Album`
 * references its tracks by id and does not embed them, so the caller — which
 * already has the loaded list — supplies it.
 */
export function useExternalAlbumPreviews(
  album: Album | null,
  songs: Song[]
): Record<string, string> {
  const samplesEnabled = useDeezerDiscoveryEnabled();
  const { data } = useQuery({
    // Scoped by identity: the same release browsed from two catalogues is two
    // different sets of clips.
    queryKey: [QueryKeys.ExternalAlbumPreviews, album?.localId],
    enabled: !!album && samplesEnabled,
    staleTime: 1000 * 60 * 60,
    queryFn: () => fetchPreviewsForExternalAlbum(album!, songs),
  });
  return data ?? {};
}
