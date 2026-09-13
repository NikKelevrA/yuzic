import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';

// Task 4.1: the catalog selectors (albums/artists/playlists/tracks/starred,
// and the selectAlbumsById/selectSongsById lookup maps) are gone — the
// catalog lives only in the persisted TanStack Query cache now. Their
// replacements are `useAlbums`/`useArtists`/`usePlaylists`/`useTracks`/
// `useStarredSongs`/`useStarredAlbums` (`src/hooks/`) and the
// `useAlbumsById`/`useSongsById` lookup-map hooks built on top of them.
// Genres alone stay in Redux — see `librarySlice`.
export const selectLibraryGenres = createSelector(
  [(state: RootState) => state.library.genres, (state: RootState) => state.servers.activeServerId],
  (genresByServer, activeServerId): string[] => {
    if (!activeServerId) return []
    return genresByServer[activeServerId] ?? []
  }
);
