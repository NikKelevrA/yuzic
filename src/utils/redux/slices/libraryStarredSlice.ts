import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';

/**
 * Holds domain `Song`/`Album` entities. See `libraryAlbumsSlice` for why this
 * is split out and why there's no migration from the pre-rewrite shape.
 *
 * `addLibraryStarredSong`/`removeLibraryStarredSong` key off `nativeId`, not
 * `localId`: the offline star/unstar mutations that dispatch these only ever
 * have the origin's own song id on hand (it's what `api.starred.add/remove`
 * take), and this list — like `libraryPlaylists` — is always scoped to the
 * one currently active server, so a native id can't collide across origins
 * here the way it could in a cross-origin Set.
 */
interface LibraryStarredState {
  starred: Song[];
  starredAlbums: Album[];
}

const initialState: LibraryStarredState = {
  starred: [],
  starredAlbums: [],
};

const libraryStarredSlice = createSlice({
  name: 'libraryStarred',
  initialState,
  reducers: {
    setLibraryStarred(state, action: PayloadAction<Song[]>) {
      state.starred = action.payload;
    },
    addLibraryStarredSong(state, action: PayloadAction<Song>) {
      if (!state.starred.some(song => song.nativeId === action.payload.nativeId)) {
        state.starred.push(action.payload);
      }
    },
    removeLibraryStarredSong(state, action: PayloadAction<string>) {
      state.starred = state.starred.filter(song => song.nativeId !== action.payload);
    },
    setLibraryStarredAlbums(state, action: PayloadAction<Album[]>) {
      state.starredAlbums = action.payload;
    },
    clearLibraryStarred(state) {
      state.starred = [];
      state.starredAlbums = [];
    },
  },
});

export const {
  setLibraryStarred,
  addLibraryStarredSong,
  removeLibraryStarredSong,
  setLibraryStarredAlbums,
  clearLibraryStarred,
} = libraryStarredSlice.actions;

export default libraryStarredSlice.reducer;
