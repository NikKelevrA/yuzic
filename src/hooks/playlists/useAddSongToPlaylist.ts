import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useApi } from '@/api';
import { QueryKeys } from '@/enums/queryKeys';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import type { Playlist } from '@/domain/entities/Playlist';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import type { Song } from '@/domain/entities/Song';
import { useIsOffline } from '@/hooks/useIsOffline';
import { usePlayableSongResolver } from '@/hooks/songs';
import { enqueueOfflineMutationAction } from '@/utils/redux/slices/offlineMutationsSlice';
import { createOfflineMutationId } from '@/utils/offline/offlineMutations';

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
        // Membership is an identity comparison: the same recording reached
        // from two origins is not the same track.
        const addToCache = (old: PlaylistDetail | null | undefined): PlaylistDetail | null | undefined => {
          if (!old) return old;
          if (old.songs.some(s => s.localId === song.localId)) return old;
          // The playlist's own references and the detail's songs have to stay
          // in agreement, so both grow together.
          return {
            playlist: { ...old.playlist, songIds: [...old.playlist.songIds, song.localId] },
            songs: [...old.songs, song],
          };
        };

        queryClient.setQueryData<PlaylistDetail | null>(
          [QueryKeys.Playlist, activeServer?.id, playlistId],
          addToCache
        );
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
