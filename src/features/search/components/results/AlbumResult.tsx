import React from 'react';

import type { SearchResult } from '@/features/search/SearchContext';
import type { Album } from '@/domain/entities/Album';
import AlbumRow, { isExternalAlbum } from '@/components/rows/AlbumRow';
import { resultToAlbum } from '@/features/search/searchResultAdapters';
import { prefetchCovers } from '@/features/artwork/imageCache';

type Props = {
  result: SearchResult;
  activeServerId: string | undefined;
  navigation: { navigate: (screen: string, params: Record<string, unknown>) => void };
  navigateToAlbum: (album: Album) => void;
  onSelect: (result: SearchResult) => void;
};

/**
 * One album row, rendered once regardless of provenance — `resultToAlbum`
 * is the single place local vs. external is decided (as data, not a
 * component branch), and `isExternalAlbum` (already provenance-driven in
 * `AlbumRow` itself) is what the press handler below reads to pick a
 * navigation path, rather than re-testing `result.source`.
 */
export default function AlbumResult({ result, activeServerId, navigation, navigateToAlbum, onSelect }: Props) {
  return (
    <AlbumRow
      album={resultToAlbum(result, activeServerId)}
      // A decorated line ("Artist · 2001") replaces the bare artist name.
      subtextOverride={result.artistName ? result.subtext : undefined}
      onPress={album => {
        onSelect(result);
        prefetchCovers([album.cover], 'detail');
        if (isExternalAlbum(album)) {
          navigateToAlbum(album);
          return;
        }
        // Server adapter identity — becomes `useAlbum(id)` -> `api.albums.get(id)`.
        navigation.navigate('albumView', { id: album.nativeId });
      }}
    />
  );
}
