import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Playlist } from '@/domain/entities/Playlist';

/**
 * Holds domain `Playlist` entities. See `libraryAlbumsSlice` for why this is
 * split out and why there's no migration from the pre-rewrite shape.
 *
 * The mutation reducers below key off `nativeId`, not `localId`. Every
 * caller here is a mutation callsite (`useAddSongToPlaylist`,
 * `useRenamePlaylist`, ...) that just called `api.playlists.*` with the
 * playlist's id at the origin — that's a native id, and the synced library
 * this slice holds is always scoped to one active server at a time, so a
 * native id collision across origins can't happen here the way it could in
 * a cross-origin queue or Set.
 */
interface LibraryPlaylistsState {
  playlists: Playlist[];
}

const initialState: LibraryPlaylistsState = { playlists: [] };

const slice = createSlice({
  name: 'libraryPlaylists',
  initialState,
  reducers: {
    setLibraryPlaylists(state, action: PayloadAction<Playlist[]>) {
      state.playlists = action.payload;
    },
    // Neither reducer touches `songIds` — the playlist's track list is
    // loaded separately (see `PlaylistDetail`) and isn't synced into this
    // list-level slice, matching the pre-rewrite behaviour where these two
    // actions only ever bumped the playlist's `changed` timestamp.
    addLibraryPlaylistSong(
      state,
      action: PayloadAction<{ playlistId: string; song: unknown }>
    ) {
      const playlist = state.playlists.find(p => p.nativeId === action.payload.playlistId);
      if (!playlist) return;
      playlist.updatedAt = Date.now();
    },
    removeLibraryPlaylistSong(
      state,
      action: PayloadAction<{ playlistId: string; songId: string }>
    ) {
      const playlist = state.playlists.find(p => p.nativeId === action.payload.playlistId);
      if (!playlist) return;
      playlist.updatedAt = Date.now();
    },
    renameLibraryPlaylist(state, action: PayloadAction<{ id: string; newName: string }>) {
      const playlist = state.playlists.find(p => p.nativeId === action.payload.id);
      if (!playlist) return;
      playlist.title = action.payload.newName;
      playlist.updatedAt = Date.now();
    },
    removeLibraryPlaylist(state, action: PayloadAction<string>) {
      state.playlists = state.playlists.filter(p => p.nativeId !== action.payload);
    },
    clearLibraryPlaylists(state) {
      state.playlists = [];
    },
  },
});

export const {
  setLibraryPlaylists,
  addLibraryPlaylistSong,
  removeLibraryPlaylistSong,
  renameLibraryPlaylist,
  removeLibraryPlaylist,
  clearLibraryPlaylists,
} = slice.actions;
export default slice.reducer;
