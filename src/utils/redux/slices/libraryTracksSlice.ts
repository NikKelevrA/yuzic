import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Song } from '@/domain/entities/Song';

/**
 * Historically the biggest persisted blob. Split off so its
 * JSON.parse on cold-boot doesn't block the album/artist rehydrate.
 *
 * Holds domain `Song` entities —
 * notably these carry no `streamUrl`; a stream URL is built at the player
 * boundary (see `usePlayableSongResolver`), never stored here.
 */
interface LibraryTracksState {
  tracks: Song[];
}

const initialState: LibraryTracksState = { tracks: [] };

const slice = createSlice({
  name: 'libraryTracks',
  initialState,
  reducers: {
    setLibraryTracks(state, action: PayloadAction<Song[]>) {
      state.tracks = action.payload;
    },
    clearLibraryTracks(state) {
      state.tracks = [];
    },
  },
});

export const { setLibraryTracks, clearLibraryTracks } = slice.actions;
export default slice.reducer;
