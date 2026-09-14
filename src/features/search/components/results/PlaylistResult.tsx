import React from 'react';

import type { SearchResult } from '@/features/search/SearchContext';
import PlaylistRow from '@/components/rows/PlaylistRow';
import { resultToPlaylist } from '@/features/search/searchResultAdapters';
import { prefetchCovers } from '@/utils/images/imageCache';

type Props = {
  result: SearchResult;
  activeServerId: string | undefined;
  navigation: { navigate: (screen: string, params: Record<string, unknown>) => void };
  onSelect: (result: SearchResult) => void;
};

/** A playlist result row — always local; playlists have no external form
 *  today (see `SearchEntityType`). */
export default function PlaylistResult({ result, activeServerId, navigation, onSelect }: Props) {
  return (
    <PlaylistRow
      playlist={resultToPlaylist(result, activeServerId)}
      onPress={() => {
        onSelect(result);
        prefetchCovers([result.cover], 'detail');
        navigation.navigate('playlistView', { id: result.id });
      }}
    />
  );
}
