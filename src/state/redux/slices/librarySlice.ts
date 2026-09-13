import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Task 4.1: TanStack Query is the sole catalog store. The
// libraryAlbums/libraryArtists/libraryPlaylists/libraryTracks/libraryStarred
// slices, and the catalog re-exports this file used to carry for them, are
// gone — the persisted query cache (`PersistQueryClientProvider` in
// `_layout.tsx`) is what `useAlbums`/`useArtists`/`usePlaylists`/
// `useTracks`/`useStarredSongs`/`useStarredAlbums` read, online or off.
//
// Genres stay here — they're not catalog in the sense the others were (no
// TanStack query fetches "the genre list" as its own entity the way it
// fetches albums; `useSync` writes it directly from a `fetchQuery` result)
// and the payload is tiny (a Record<serverId, string[]>), so keeping it in
// its own slice would create a persist key for no gain.
interface LibraryState {
  genres: Record<string, string[]>;
}

const initialState: LibraryState = {
  genres: {},
};

const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {
    setLibraryGenres(state, action: PayloadAction<{ serverId: string; genres: string[] }>) {
      state.genres[action.payload.serverId] = action.payload.genres;
    },
    clearLibraryGenres(state) {
      state.genres = {};
    },
  },
});

export const {
  setLibraryGenres,
  clearLibraryGenres,
} = librarySlice.actions;

export default librarySlice.reducer;
