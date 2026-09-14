import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { useAlbums } from '@/features/album/useAlbums';
import { matchAlbumToLibrary } from './matchToLibrary';
import type { Album } from '@/domain/entities/Album';
import { resolveLibraryState, type LibraryState } from '@/domain/library/LibraryState';
import { useAnyAlbumDownloaderConnected } from '@/features/downloaders/registry';
import { selectIsWanted } from '@/state/redux/selectors/wantsSelectors';

/**
 * Thin React wrapper around the domain `resolveLibraryState`: assembles
 * `LibraryFacts` for a given browsed album from redux/context state, then
 * hands off to the pure resolver. All state-source decisions live here;
 * precedence logic stays in the domain function.
 */
export function useLibraryState(album: Album | null): LibraryState {
  const { albums: libraryAlbums } = useAlbums();
  // Acquirable means something connected can fetch a whole album.
  const isAcquirable = useAnyAlbumDownloaderConnected();
  const isWanted = useSelector(
    album?.localId ? selectIsWanted(album.localId) : () => false
  );

  const isInLibrary = useMemo(() => {
    if (!album) return false;
    return matchAlbumToLibrary(
      { externalIds: album.externalIds, title: album.title, artistName: album.artist.name },
      libraryAlbums
    ) !== null;
  }, [album, libraryAlbums]);

  return useMemo(
    () =>
      resolveLibraryState({
        isPresent: isInLibrary,
        isWanted,
        isAcquirable,
      }),
    [isInLibrary, isWanted, isAcquirable]
  );
}
