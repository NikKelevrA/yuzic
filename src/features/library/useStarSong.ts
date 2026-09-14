import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import { QueryKeys } from '@/state/query/queryKeys';
import { FAVORITES_ID } from '@/constants/favorites';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { usePlayableSongResolver } from '@/features/song/usePlayableSongResolver';
import { enqueueOfflineMutationAction } from '@/state/redux/slices/offlineMutationsSlice';
import { createOfflineMutationId } from '@/features/offline/offlineMutations';

type StarSongInput = string | Song;

export function useStarSong() {
  const api = useApi();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();
  const { resolvePlayableSong } = usePlayableSongResolver();

  return useMutation({
    mutationFn: async (input: StarSongInput) => {
      const songId = typeof input === 'string' ? input : input.nativeId;
      // The resolver hands back a playable resource; what the offline queue
      // wants is the song inside it, not the session URL.
      const resolved = await resolvePlayableSong(input, { allowNetwork: !isOffline });

      if (isOffline) {
        if (!activeServer?.id || !resolved) throw new Error('Song is not available offline.');
        const song = resolved.song;
        // Optimistically add to the persisted `[Starred, serverId]` query
        // cache — the same cache the live path reads, so there's no second
        // store to keep in sync. `useStarredSongs`/`useStarredAlbums` (and
        // the favorites playlist screen) pick this up on their next render.
        queryClient.setQueryData<{ songs: Song[]; albums: Album[] }>(
          [QueryKeys.Starred, activeServer.id],
          current => {
            const base = current ?? { songs: [], albums: [] };
            if (base.songs.some(s => s.nativeId === song.nativeId)) return base;
            return { ...base, songs: [...base.songs, song] };
          }
        );
        dispatch(enqueueOfflineMutationAction({
          id: createOfflineMutationId('starSong', [activeServer.id, song.localId]),
          serverId: activeServer.id,
          type: 'starSong',
          song,
          createdAt: Date.now(),
        }));
        return;
      }

      await api.starred.add(songId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Starred] });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.Playlist, activeServer?.id, FAVORITES_ID],
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.Playlists, activeServer?.id],
      });
    },
  });
}
