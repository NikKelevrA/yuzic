import React from 'react';

import type { SearchResult } from '@/contexts/SearchContext';
import type { Artist } from '@/domain/entities/Artist';
import ArtistRow from '@/components/rows/ArtistRow';
import { resultToArtist, isExternalArtist } from '@/features/search/searchResultAdapters';
import { prefetchCovers } from '@/utils/images/imageCache';

type Props = {
  result: SearchResult;
  activeServerId: string | undefined;
  navigation: { navigate: (screen: string, params: Record<string, unknown>) => void };
  navigateToArtist: (artist: Artist) => void;
  onSelect: (result: SearchResult) => void;
};

/** One artist row, rendered once regardless of provenance — see `AlbumResult`
 *  for the same reasoning applied to albums. */
export default function ArtistResult({ result, activeServerId, navigation, navigateToArtist, onSelect }: Props) {
  return (
    <ArtistRow
      artist={resultToArtist(result, activeServerId)}
      rounded
      onPress={artist => {
        onSelect(result);
        prefetchCovers([artist.cover], 'detail');
        if (isExternalArtist(artist)) {
          navigateToArtist(artist);
          return;
        }
        navigation.navigate('artistView', { id: artist.nativeId });
      }}
    />
  );
}
