import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useApi } from '@/api';
import { QueryKeys } from '@/enums/queryKeys';
import { FAVORITES_ID } from '@/constants/favorites';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { useIsOffline } from '@/hooks/useIsOffline';
import { enqueueOfflineMutationAction } from '@/state/redux/slices/offlineMutationsSlice';
import { createOfflineMutationId } from '@/utils/offline/offlineMutations';

export function useUnstarSong() {
  const api = useApi();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();

  return useMutation({
    mutationFn: async (songId: string) => {
      if (isOffline) {
        if (!activeServer?.id) throw new Error('No active server.');
        // See `useStarSong` — optimistically mutate the persisted
        // `[Starred, serverId]` query cache directly; no second store.
        queryClient.setQueryData<{ songs: Song[]; albums: Album[] }>(
          [QueryKeys.Starred, activeServer.id],
          current => {
            if (!current) return current;
            return { ...current, songs: current.songs.filter(s => s.nativeId !== songId) };
          }
        );
        // The queue is keyed by identity so a queued add and a later remove of
        // the same track collapse. These operations only ever address the
        // active server, so its provenance is the right scope to build it in.
        const queuedSongId = makeLocalId('song', serverProvenance(activeServer.id), songId);
        dispatch(enqueueOfflineMutationAction({
          id: createOfflineMutationId('unstarSong', [activeServer.id, songId]),
          serverId: activeServer.id,
          type: 'unstarSong',
          songId: queuedSongId,
          createdAt: Date.now(),
        }));
        return;
      }

      await api.starred.remove(songId);
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
