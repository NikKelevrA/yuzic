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

/**
 * Favourites an album, offline too.
 *
 * Offline it used to fail outright, while favouriting a song beside it queued —
 * the one favourite that needed a connection. It queues now the same way: the
 * persisted starred cache changes at once and the server is told on reconnect.
 */
export function useStarAlbum() {
  const api = useApi();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();

  return useMutation({
    mutationFn: async (album: Album) => {
      if (isOffline) {
        if (!activeServer?.id) throw new Error('No active server.');
        queryClient.setQueryData<Starred>([QueryKeys.Starred, activeServer.id], current => {
          const base = current ?? { songs: [], albums: [] };
          if (base.albums.some(a => a.localId === album.localId)) return base;
          return { ...base, albums: [...base.albums, album] };
        });
        dispatch(enqueueOfflineMutationAction({
          id: createOfflineMutationId('starAlbum', [activeServer.id, album.localId]),
          serverId: activeServer.id,
          type: 'starAlbum',
          album,
          createdAt: Date.now(),
        }));
        return;
      }
      await api.starred.add(album.nativeId, 'album');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Starred, activeServer?.id] });
    },
  });
}
