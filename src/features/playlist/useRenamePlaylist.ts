import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import { QueryKeys } from '@/state/query/queryKeys';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import type { Playlist } from '@/domain/entities/Playlist';
import type { PlaylistDetail } from '@/domain/entities/Detail';

export function useRenamePlaylist() {
  const api = useApi();
  const queryClient = useQueryClient();
  const activeServer = useSelector(selectActiveServer);

  return useMutation({
    mutationFn: async ({ id, newName }: { id: string; newName: string }) => {
      await api.playlists.rename(id, newName);
    },
    onSuccess: (_, { id, newName }) => {
      // Patch the persisted query cache directly for instant feedback —
      // same reasoning as the other playlist mutations — then invalidate so
      // a background refetch reconciles anything the server changed beyond
      // the name.
      queryClient.setQueryData<Playlist[]>(
        [QueryKeys.Playlists, activeServer?.id],
        (old) => old?.map(playlist =>
          playlist.nativeId === id ? { ...playlist, title: newName, updatedAt: Date.now() } : playlist
        )
      );
      queryClient.setQueryData<PlaylistDetail | null>(
        [QueryKeys.Playlist, activeServer?.id, id],
        (old) => old ? { ...old, playlist: { ...old.playlist, title: newName, updatedAt: Date.now() } } : old
      );
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Playlists, activeServer?.id] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Playlist, activeServer?.id, id] });
    },
  });
}
