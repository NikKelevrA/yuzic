import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useApi } from '@/api';
import { QueryKeys } from '@/enums/queryKeys';
import { FAVORITES_ID } from '@/constants/favorites';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import type { Song } from '@/domain/entities/Song';
import { useIsOffline } from '@/hooks/useIsOffline';
import { usePlayableSongResolver } from '@/hooks/songs';
import { addLibraryStarredSong } from '@/utils/redux/slices/libraryStarredSlice';
import { enqueueOfflineMutationAction } from '@/utils/redux/slices/offlineMutationsSlice';
import { createOfflineMutationId } from '@/utils/offline/offlineMutations';

type StarSongInput = string | Song;

export function useStarSong() {
  const api = useApi();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();
  const { resolvePlayableSong } = usePlayableSongResolver();
  // `libraryStarred` now stores domain `Song` entities; `resolvePlayableSong`
  // still returns the legacy playable shape the offline-mutation queue and
  // player expect (see `usePlayableSongResolver`). Look the domain entity up
  // by nativeId to dispatch the right shape into Redux; the legacy `song` is
  // still what's enqueued for eventual replay to the server.

  return useMutation({
    mutationFn: async (input: StarSongInput) => {
      const songId = typeof input === 'string' ? input : input.nativeId;
      // The resolver hands back a playable resource; what the library and the
      // offline queue want is the song inside it, not the session URL.
      const resolved = await resolvePlayableSong(input, { allowNetwork: !isOffline });

      if (isOffline) {
        if (!activeServer?.id || !resolved) throw new Error('Song is not available offline.');
        const song = resolved.song;
        dispatch(addLibraryStarredSong(song));
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
