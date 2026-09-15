import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import { QueryKeys } from '@/state/query/queryKeys';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import type { PlaylistMove } from '@/providers/contracts/ServerAdapter';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { withMovedEntry } from './playlistCache';
import { PLAYLIST_EDIT_SCOPE } from './playlistEditScope';

type MoveSongArgs = PlaylistMove & { playlistId: string };

/**
 * Moves one entry of a playlist.
 *
 * The list is reordered in the cache before the server is asked, because the
 * row has already been dropped where the user put it — waiting for the
 * server would snap it back first. A refusal puts the cached order back and
 * reloads from the server, which is also the answer when the playlist
 * changed somewhere else. Not queued offline: an order computed against a
 * playlist that may change before reconnecting is a guess.
 */
export function useMoveSongInPlaylist() {
  const api = useApi();
  const queryClient = useQueryClient();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();

  return useMutation({
    scope: PLAYLIST_EDIT_SCOPE,
    onMutate: async ({ playlistId, songId, from, to }: MoveSongArgs) => {
      const key = [QueryKeys.Playlist, activeServer?.id, playlistId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlaylistDetail | null>(key);
      if (previous) queryClient.setQueryData(key, withMovedEntry(previous, songId, from, to));
      return { key, previous };
    },
    mutationFn: async ({ playlistId, ...move }: MoveSongArgs) => {
      if (isOffline) throw new Error('offline');
      await api.playlists.moveSong(playlistId, move);
    },
    onError: (_error, _args, context) => {
      if (!context) return;
      queryClient.setQueryData(context.key, context.previous);
      void queryClient.invalidateQueries({ queryKey: context.key });
    },
  });
}
