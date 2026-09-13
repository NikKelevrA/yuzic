import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Album } from '@/domain/entities/Album';

/**
 * Separated from the shared `library` slice so its persisted JSON blob
 * doesn't compete with tracks / artists / playlists during cold-boot
 * rehydrate. Each collection now stringifies and MMKV-writes independently.
 *
 * Holds domain `Album` entities. There is no
 * migration for the old persisted shape — this slice's MMKV key is read by
 * nothing else, so a fresh sync simply repopulates it in the new shape.
 */
interface LibraryAlbumsState {
  albums: Album[];
}

const initialState: LibraryAlbumsState = { albums: [] };

const slice = createSlice({
  name: 'libraryAlbums',
  initialState,
  reducers: {
    setLibraryAlbums(state, action: PayloadAction<Album[]>) {
      state.albums = action.payload;
    },
    clearLibraryAlbums(state) {
      state.albums = [];
    },
  },
});

export const { setLibraryAlbums, clearLibraryAlbums } = slice.actions;
export default slice.reducer;
