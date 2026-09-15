import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import { QueryKeys } from '@/state/query/queryKeys';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import type { Playlist } from '@/domain/entities/Playlist';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import type { Song } from '@/domain/entities/Song';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { usePlayableSongResolver } from '@/features/song/usePlayableSongResolver';
import { enqueueOfflineMutationAction } from '@/state/redux/slices/offlineMutationsSlice';
import { createOfflineMutationId } from '@/features/offline/offlineMutations';
import { withAppendedSong } from './playlistCache';
import { PLAYLIST_EDIT_SCOPE } from './playlistEditScope';

type AddSongArgs = {
  playlistId: string;
  songId?: string;
  song?: Song;
};

export function useAddSongToPlaylist() {
  const api = useApi();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const isOffline = useIsOffline();
  const { resolvePlayableSong } = usePlayableSongResolver();

  return useMutation({
    scope: PLAYLIST_EDIT_SCOPE,
    mutationFn: async ({ playlistId, songId, song: inputSong }: AddSongArgs) => {
      const resolvedSongId = songId ?? inputSong?.nativeId;
      if (!resolvedSongId) throw new Error('Missing song id.');
      // The resolver returns a playable resource; the cache and the offline
      // queue want the song inside it, never the session-scoped URL.
      const resolved = await resolvePlayableSong(inputSong ?? resolvedSongId, { allowNetwork: !isOffline });
      const song = resolved?.song;

      if (isOffline) {
        if (!activeServer?.id || !song) throw new Error('Song is not available offline.');
        dispatch(enqueueOfflineMutationAction({
          id: createOfflineMutationId('addSongToPlaylist', [activeServer.id, playlistId, song.localId]),
          serverId: activeServer.id,
          type: 'addSongToPlaylist',
          playlistId,
          song,
          createdAt: Date.now(),
        }));
        return { song };
      }

      await api.playlists.addSong(playlistId, resolvedSongId);
      return { song };
    },
    onSuccess: (result, { playlistId }) => {
      if (result.song) {
        const song = result.song;
        // Appended as the server appends — a second copy included. Skipping a
        // song already cached left the screen one entry short of the server,
        // and a later positional edit then addressed the wrong entry.
        queryClient.setQueryData<PlaylistDetail | null>(
          [QueryKeys.Playlist, activeServer?.id, playlistId],
          (old) => old ? withAppendedSong(old, song) : old
        );
        // Some servers decline a duplicate instead; the reload settles which.
        if (!isOffline) {
          void queryClient.invalidateQueries({ queryKey: [QueryKeys.Playlist, activeServer?.id, playlistId] });
        }
        queryClient.setQueryData<Playlist[]>(
          [QueryKeys.Playlists, activeServer?.id],
          (old) => old?.map(playlist =>
            playlist.nativeId === playlistId ? { ...playlist, updatedAt: Date.now() } : playlist
          )
        );
      } else {
        // No song object available — fall back to invalidation so UI stays correct
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.Playlist, activeServer?.id, playlistId],
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.Playlists, activeServer?.id],
        });
      }
    },
  });
}
