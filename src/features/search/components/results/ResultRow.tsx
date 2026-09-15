import React from 'react';

import type { SearchResult } from '@/features/search/SearchContext';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import SongResult from './SongResult';
import AlbumResult from './AlbumResult';
import ArtistResult from './ArtistResult';
import PlaylistResult from './PlaylistResult';

type Props = {
  result: SearchResult;
  activeServerId: string | undefined;
  navigation: { navigate: (screen: string, params: Record<string, unknown>) => void };
  navigateToAlbum: (album: Album) => void;
  navigateToArtist: (artist: Artist) => void;
  onSelect: (result: SearchResult) => void;
  onSongPress: (result: SearchResult) => void;
  onSongOptions: (result: SearchResult) => void;
};

/** Dispatches a result to its type-specific row. One result type, one
 *  component, chosen by `result.type` — never by `result.source`. */
export default function ResultRow({
  result, activeServerId, navigation, navigateToAlbum, navigateToArtist, onSelect, onSongPress, onSongOptions,
}: Props) {
  switch (result.type) {
    case 'song':
      return <SongResult result={result} onPress={onSongPress} onOptions={onSongOptions} />;
    case 'album':
      return (
        <AlbumResult
          result={result}
          activeServerId={activeServerId}
          navigation={navigation}
          navigateToAlbum={navigateToAlbum}
          onSelect={onSelect}
        />
      );
    case 'artist':
      return (
        <ArtistResult
          result={result}
          activeServerId={activeServerId}
          navigation={navigation}
          navigateToArtist={navigateToArtist}
          onSelect={onSelect}
        />
      );
    case 'playlist':
      return (
        <PlaylistResult result={result} activeServerId={activeServerId} navigation={navigation} onSelect={onSelect} />
      );
    default:
      return null;
  }
}
