import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';

import type { PlaylistDetail } from '@/domain/entities/Detail';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { useApi } from '@/providers/registry/useApi';
import { QueryKeys } from '@/state/query/queryKeys';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';

/**
 * Which playlists a song is in, and the user's pending changes to that.
 *
 * `baseSelectedIds` is what the server holds; `selectedIds` is what the user
 * has ticked. The difference is what Done writes. While the sheet is open,
 * every playlist's detail is fetched (three at a time) so the ticks start from
 * the truth rather than whatever happened to be cached.
 */
export function usePlaylistMembership(
  selectedSong: Song | null,
  playlists: Playlist[],
  isSheetOpen: boolean,
) {
  const api = useApi();
  const queryClient = useQueryClient();
  const activeServer = useSelector(selectActiveServer);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [baseSelectedIds, setBaseSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const initialIds = useMemo(() => {
    if (!selectedSong) return new Set<string>();
    // Membership is an identity question — the same song reached from two
    // origins is not the same track — so it compares localId, not the
    // origin's own id.
    const selectedSongId = selectedSong.localId;

    return new Set(
      playlists
        .filter(p => {
          // Only the individual playlist's cache entry carries its songs; the
          // list query returns playlists whose songIds are empty by design.
          const cached = queryClient.getQueryData<PlaylistDetail | null>(
            [QueryKeys.Playlist, activeServer?.id, p.nativeId]
          );
          if (cached) return cached.songs.some(s => s.localId === selectedSongId);
          return false;
        })
        .map(p => p.nativeId)
    );
  }, [playlists, selectedSong, queryClient, activeServer?.id]);

  useEffect(() => {
    setSelectedIds(new Set(initialIds));
    setBaseSelectedIds(new Set(initialIds));
  }, [initialIds]);

  useEffect(() => {
    if (!isSheetOpen || !selectedSong || !activeServer?.id || !playlists.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const selectedSongId = selectedSong.localId;
    setLoading(true);

    const hydrateMembership = async () => {
      const results: PlaylistDetail[] = [];
      for (let start = 0; start < playlists.length; start += 3) {
        const batch = await Promise.all(
          playlists.slice(start, start + 3).map(playlist =>
            queryClient.fetchQuery<PlaylistDetail>({
              queryKey: [QueryKeys.Playlist, activeServer.id, playlist.nativeId],
              queryFn: () => api.playlists.get(playlist.nativeId),
              staleTime: staleTime.playlists,
            })
          )
        );
        results.push(...batch);
      }

      if (cancelled) return;
      const hydratedIds = new Set<string>();
      results.forEach((result, index) => {
        if (result.songs.some(song => song.localId === selectedSongId)) {
          hydratedIds.add(playlists[index].nativeId);
        }
      });
      setSelectedIds(hydratedIds);
      setBaseSelectedIds(hydratedIds);
    };

    void hydrateMembership()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeServer?.id, api, isSheetOpen, playlists, queryClient, selectedSong]);

  const toggle = useCallback((id: string) => {
    if (loading) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [loading]);

  return { selectedIds, baseSelectedIds, loading, toggle };
}
