import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/features/offline/downloadStore';
import type { DownloaderQueueItem } from '@/features/downloaders/queueItem';

/**
 * The line of detail under a queue row's title.
 *
 * There were three of these — one per downloader — and they differed only in
 * which facts they had to show: Lidarr counts an album's tracks, slskd counts
 * a directory's files and reports a rate and a peer, SoulSync names the album
 * a track belongs to. All three then rendered the same queue row
 * with the same props, so what actually varied was this string.
 *
 * Composing it from whichever facts are present means a fourth downloader
 * needs no fourth hook: it fills in what it knows when it normalises its
 * queue, and whatever it leaves out simply does not appear.
 */
export function useQueueRowSubtitle(): (item: DownloaderQueueItem) => string {
  const { t } = useTranslation();

  return useCallback((item: DownloaderQueueItem) => {
    const parts: string[] = [];

    // The peer stands in for an artist rather than joining it: a Soulseek
    // transfer has one or the other, and showing "· someuser" after a real
    // artist name reads as a second artist.
    const attribution = item.artistName || item.albumTitle || item.peer;
    if (attribution) parts.push(attribution);

    if (item.trackCount && item.trackCount > 0) {
      parts.push(`${item.trackCount} ${t('settings.downloaders.tracks', { count: item.trackCount })}`);
    }
    if (item.fileCount && item.fileCount > 0) {
      parts.push(`${item.fileCount} ${t('settings.downloaders.files', { count: item.fileCount })}`);
    }
    if (item.sizeBytes && item.sizeBytes > 0) {
      parts.push(formatBytes(item.sizeBytes));
    }
    // Only while it is moving. A rate on a finished transfer is the rate it
    // managed at the end, which reads as though it were still going.
    if (item.active && item.speedBytesPerSec && item.speedBytesPerSec > 0) {
      parts.push(t('settings.downloaders.speed', { rate: formatBytes(item.speedBytesPerSec) }));
    }

    return parts.join(' · ');
  }, [t]);
}
