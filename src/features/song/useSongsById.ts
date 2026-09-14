import { useMemo } from 'react';
import type { Song } from '@/domain/entities/Song';
import { useTracks } from './useTracks';

/**
 * O(1) lookup map over the synced track catalog (now the persisted TanStack
 * Query cache via `useTracks`, not a Redux mirror — see `useAlbums` for why).
 * Keyed by `nativeId`: every caller looks a song up by the id it already has
 * from an origin-facing call (a queue entry, a download record, ...), and
 * the catalog is always scoped to one active server at a time, so a
 * `nativeId` collision across origins can't occur.
 */
export function useSongsById(): Map<string, Song> {
  const { tracks } = useTracks();
  return useMemo(() => new Map(tracks.map(song => [song.nativeId, song])), [tracks]);
}
