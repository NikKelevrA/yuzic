import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import type { NetworkType } from '@/features/connectivity/useNetworkType';
import type { DownloadProgress } from './downloadProgress';
import { deleteDownloadedFiles } from './filesystem';
import { mayDownloadNow } from './networkPolicy';
import type { OfflineDownloader } from './offlineDownloader';
import type { OfflineStore } from './offlineStore';

/**
 * When offline storage does its housekeeping: tidying up after the restore on
 * launch, starting the queue whenever it can run, and saving transfers before
 * the app is suspended.
 */
export function useOfflineLifecycle(
  store: OfflineStore,
  downloader: OfflineDownloader,
  progress: DownloadProgress,
  network: { wifiOnly: boolean; networkType: NetworkType },
): void {
  useEffect(() => () => progress.dispose(), [progress]);

  // Files of entries the restore dropped. Best-effort and not awaited: a file
  // that will not delete is wasted space, not a reason to hold up launch.
  useEffect(() => {
    const stalePaths = store.takeStalePaths();
    if (stalePaths.length) void deleteDownloadedFiles(stalePaths);
  }, [store]);

  // Entries whose files are gone — deleted outside the app, or a reinstall
  // that kept the metadata — are dropped rather than shown as downloaded.
  useEffect(() => {
    const tracks = store.tracks();
    if (!tracks.length) return;
    void Promise.all(tracks.map(async track => {
      const info = await FileSystem.getInfoAsync(track.localPath).catch(() => ({ exists: false }));
      return info.exists ? null : track.trackId;
    })).then(results => {
      const missing = new Set(results.filter((id): id is string => id !== null));
      if (!missing.size) return;
      store.updateTracks(current => current.filter(track => !missing.has(track.trackId)));
      store.updateCollections(collections => collections
        .map(collection => ({ ...collection, trackIds: collection.trackIds.filter(id => !missing.has(id)) }))
        .filter(collection => collection.trackIds.length > 0));
    });
  }, [store]);

  useEffect(() => {
    // Keeps the partials a resumable still points at; sweeping those on every
    // launch is how an interrupted 40MB track used to start again from zero.
    downloader.sweepStaging();
    if (store.jobs().length) void downloader.processQueue();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && store.jobs().length) {
        void downloader.processQueue();
        return;
      }
      // Leaving the foreground is the last chance to note where each transfer
      // had got to before the process may be killed.
      if (state === 'background') void downloader.pauseActive();
    });
    return () => subscription.remove();
  }, [downloader, store]);

  // Back on Wi-Fi, or the restriction lifted: the other ways a held queue
  // becomes runnable, neither of which goes through AppState.
  const { wifiOnly, networkType } = network;
  useEffect(() => {
    if (!mayDownloadNow({ wifiOnly, networkType })) return;
    if (store.jobs().length) void downloader.processQueue();
  }, [downloader, networkType, store, wifiOnly]);
}
