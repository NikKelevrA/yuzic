import { createSelector } from '@reduxjs/toolkit';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { RootState } from '../store';

export const selectLibraryAlbums = (state: RootState) => state.libraryAlbums.albums;
export const selectLibraryArtists = (state: RootState) => state.libraryArtists.artists;
export const selectLibraryPlaylists = (state: RootState) => state.libraryPlaylists.playlists;
export const selectLibraryTracks = (state: RootState) => state.libraryTracks.tracks;
export const selectLibraryGenres = createSelector(
  [(state: RootState) => state.library.genres, (state: RootState) => state.servers.activeServerId],
  (genresByServer, activeServerId): string[] => {
    if (!activeServerId) return []
    return genresByServer[activeServerId] ?? []
  }
);
export const selectLibraryStarred = (state: RootState) => state.libraryStarred.starred;
export const selectLibraryStarredAlbums = (state: RootState) => state.libraryStarred.starredAlbums;

// Memoized O(1) lookup maps — rebuilt only when the underlying array changes.
// Keyed by `nativeId`: every caller of these maps looks a song/album up by
// the id it already has from an origin-facing call (a queue entry, a
// download record, ...), and this library is always scoped to one active
// server at a time, so a `nativeId` collision across origins can't occur.
export const selectAlbumsById = createSelector(
  selectLibraryAlbums,
  (albums): Map<string, Album> => new Map(albums.map(a => [a.nativeId, a]))
);

export const selectSongsById = createSelector(
  selectLibraryTracks,
  (tracks): Map<string, Song> => new Map(tracks.map(song => [song.nativeId, song]))
);
