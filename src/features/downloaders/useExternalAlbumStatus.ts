import { useMemo } from 'react';

import { useAlbums } from '@/features/album/useAlbums';
import type { Album } from '@/domain/entities/Album';
import { matchAlbumToLibrary } from '@/features/library/matchToLibrary';
import { useDownloadersQueue } from '@/features/downloaders/DownloadersQueueContext';
import { matchesAlbum } from '@/features/downloaders/queueItem';
import type { DownloaderId } from '@/state/redux/slices/downloadersSlice';

export type ExternalAlbumStatus =
  | { kind: 'in_library' }
  | { kind: 'downloading'; progress: number; source: DownloaderId }
  | { kind: 'none' };

/**
 * Whether a browsed album is already owned, being fetched, or neither.
 *
 * Reads the shared downloader queue rather than opening its own. It used to
 * run two React Query polls of its own — Lidarr and slskd, every twelve
 * seconds — with the matching for each written out here by name: a normalised
 * string comparison for one, a fuzzy directory match for the other, and
 * SoulSync missing entirely because nobody had added a third branch.
 *
 * That put provider knowledge in a hook mounted by every album row on screen,
 * and it put a third poller on a server that already had two. Both are gone:
 * the downloader normalises its own records (see `DownloaderQueueItem`) and
 * says how confidently its titles identify an album, so the comparison here is
 * one call that names nobody.
 */
export function useExternalAlbumStatus(album: Album | null): ExternalAlbumStatus {
  const { albums: libraryAlbums } = useAlbums();
  const { queues } = useDownloadersQueue();

  const isInLibrary = useMemo(() => {
    if (!album) return false;
    return matchAlbumToLibrary(
      { externalIds: album.externalIds, title: album.title, artistName: album.artist.name },
      libraryAlbums
    ) !== null;
  }, [libraryAlbums, album]);

  return useMemo<ExternalAlbumStatus>(() => {
    // Owned beats fetching: an album that arrived while its transfer was still
    // showing should read as in the library, not as still coming.
    if (isInLibrary) return { kind: 'in_library' };
    if (!album) return { kind: 'none' };

    const identity = { title: album.title, artist: album.artist.name };

    for (const queue of queues) {
      const match = queue.items.find(item => item.active && matchesAlbum(item, identity));
      if (match) {
        return { kind: 'downloading', progress: match.percentComplete, source: queue.id };
      }
    }

    return { kind: 'none' };
  }, [isInLibrary, album, queues]);
}
