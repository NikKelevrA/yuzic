import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useApi } from '@/api';
import { QueryKeys } from '@/enums/queryKeys';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { Playlist, PlaylistBase } from '@/types';
import { useIsOffline } from '@/hooks/useIsOffline';
import { removeLibraryPlaylistSong } from '@/utils/redux/slices/librarySlice';
import { enqueueOfflineMutationAction } from '@/utils/redux/slices/offlineMutationsSlice';
import { createOfflineMutationId } from '@/utils/offline/offlineMutations';

type RemoveSongArgs = {
  playlistId: string;
  songId: string;
};

export function useRemoveSongFromPlaylist() {
  const api = useApi();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();

  return useMutation({
    mutationFn: async ({ playlistId, songId }: RemoveSongArgs) => {
      if (isOffline) {
        if (!activeServer?.id) throw new Error('No active server.');
        dispatch(removeLibraryPlaylistSong({ playlistId, songId }));
        // The queue is keyed by identity so a queued add and a later remove of
        // the same track collapse. These operations only ever address the
        // active server, so its provenance is the right scope to build it in.
        const queuedSongId = makeLocalId('song', serverProvenance(activeServer.id), songId);
        dispatch(enqueueOfflineMutationAction({
          id: createOfflineMutationId('removeSongFromPlaylist', [activeServer.id, playlistId, songId]),
          serverId: activeServer.id,
          type: 'removeSongFromPlaylist',
          playlistId,
          songId: queuedSongId,
          createdAt: Date.now(),
        }));
        return;
      }

      await api.playlists.removeSong(playlistId, songId);
    },
    onSuccess: (_, { playlistId, songId }) => {
      // Patch the cache directly instead of relying solely on invalidation —
      // invalidateQueries alone does nothing observable while offline (the
      // query stays disabled until reconnect), so a removal while offline
      // left the song visibly still in the playlist with no feedback at all.
      queryClient.setQueryData<Playlist | null>(
        [QueryKeys.Playlist, activeServer?.id, playlistId],
        (old) => {
          if (!old) return old;
          return { ...old, songs: old.songs.filter(s => s.id !== songId) };
        }
      );
      queryClient.setQueryData<PlaylistBase[]>(
        [QueryKeys.Playlists, activeServer?.id],
        (old) => old?.map(playlist =>
          playlist.id === playlistId ? { ...playlist, changed: new Date() } : playlist
        )
      );
    },
  });
}
