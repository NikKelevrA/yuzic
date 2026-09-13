import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useSelector } from 'react-redux';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import {
  selectLibraryAlbums,
  selectLibraryArtists,
  selectLibraryPlaylists,
  selectLibraryTracks,
  selectLibraryGenres,
  selectLibraryStarred,
  selectLibraryStarredAlbums,
} from '@/utils/redux/selectors/librarySelectors';

interface LibraryContextType {
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  tracks: Song[];
  genres: string[];
  starred: Song[];
  starredAlbums: Album[];
}

const LibraryContext = createContext<LibraryContextType>({
  albums: [],
  artists: [],
  playlists: [],
  tracks: [],
  genres: [],
  starred: [],
  starredAlbums: [],
});

export const useLibrary = () => useContext(LibraryContext);

export const LibraryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const albums = useSelector(selectLibraryAlbums);
  const artists = useSelector(selectLibraryArtists);
  const playlists = useSelector(selectLibraryPlaylists);
  const tracks = useSelector(selectLibraryTracks);
  const genres = useSelector(selectLibraryGenres);
  const starred = useSelector(selectLibraryStarred);
  const starredAlbums = useSelector(selectLibraryStarredAlbums);

  const value = useMemo(
    () => ({ albums, artists, playlists, tracks, genres, starred, starredAlbums }),
    [albums, artists, playlists, tracks, genres, starred, starredAlbums],
  );
  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
};
