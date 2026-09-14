import { useMemo } from 'react';
import type { Album } from '@/domain/entities/Album';
import { useAlbums } from './useAlbums';

/**
 * O(1) lookup map over the synced album catalog (now the persisted TanStack
 * Query cache via `useAlbums`, not a Redux mirror — see `useAlbums` for why).
 * Keyed by `nativeId` — see `useSongsById` for why that's collision-safe here.
 */
export function useAlbumsById(): Map<string, Album> {
  const { albums } = useAlbums();
  return useMemo(() => new Map(albums.map(a => [a.nativeId, a])), [albums]);
}
