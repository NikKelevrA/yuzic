import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import { QueryKeys } from '@/state/query/queryKeys';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { enqueueOfflineMutationAction } from '@/state/redux/slices/offlineMutationsSlice';
import { createOfflineMutationId } from '@/features/offline/offlineMutations';

type Starred = { songs: Song[]; albums: Album[] };

/** Un-favourites an album; offline it queues, as `useStarAlbum` does. */
export function useUnstarAlbum() {
  const api = useApi();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();

  return useMutation({
    mutationFn: async (album: Album) => {
      if (isOffline) {
        if (!activeServer?.id) throw new Error('No active server.');
        queryClient.setQueryData<Starred>([QueryKeys.Starred, activeServer.id], current =>
          current ? { ...current, albums: current.albums.filter(a => a.localId !== album.localId) } : current
        );
        // Keyed by identity, so a queued star and this unstar collapse.
        dispatch(enqueueOfflineMutationAction({
          id: createOfflineMutationId('unstarAlbum', [activeServer.id, album.localId]),
          serverId: activeServer.id,
          type: 'unstarAlbum',
          albumId: album.localId,
          createdAt: Date.now(),
        }));
        return;
      }
      await api.starred.remove(album.nativeId, 'album');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Starred, activeServer?.id] });
    },
  });
}
