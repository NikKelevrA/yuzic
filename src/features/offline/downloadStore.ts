import type { Song } from '@/domain/entities/Song';

/**
 * Enough to pick a half-finished download back up: expo's own
 * `DownloadResumable.savable()` shape, keyed by track `localId`. Without it,
 * backgrounding the app during a 40MB track threw those 40MB away.
 */
export type PersistedResumable = {
  trackId: string;
  url: string;
  fileUri: string;
  resumeData?: string;
  /** So a stale entry from a since-changed server can be discarded. */
  savedAt: number;
};

export type PersistedDownloadJob = {
  id: string;
  type: 'track' | 'album' | 'playlist';
  collectionId?: string;
  tracks: Song[];
  createdAt: number;
  updatedAt: number;
  /** Failed runs so far; the queue drops the job once this hits its cap. */
  attempts?: number;
};

export type DownloadedTrackEntry = {
  trackId: string;
  fileSize: number;
  downloadedAt: number;
  albumId: string;
  artistId: string;
  serverId: string;
  serverType: string;
  coverKind: string;
};

export type DownloadedCollectionEntry = {
  id: string;
  type: 'album' | 'playlist';
  trackIds: string[];
  downloadedAt: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIdx]}`;
}
