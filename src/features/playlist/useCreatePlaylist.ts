import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import { QueryKeys } from '@/enums/queryKeys';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { useIsOffline } from '@/features/connectivity/useIsOffline';

export function useCreatePlaylist() {
  const api = useApi();
  const queryClient = useQueryClient();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();

  return useMutation({
    mutationFn: async (name: string) => {
      if (isOffline) throw new Error('offline');
      return api.playlists.create(name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.Playlists, activeServer?.id],
      });
    },
  });
}