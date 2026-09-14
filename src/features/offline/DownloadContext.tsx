import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import * as FileSystem from 'expo-file-system/legacy';

import { notify } from '@/components/toast';
import { useNetworkType } from '@/features/connectivity/useNetworkType';
import { useLatestRef } from '@/features/playback/useLatestRef';
import { mediaHeadersForSong } from '@/features/player/mediaHeaders';
import { selectDownloadOnWifiOnly } from '@/features/settings/downloads/state';
import { selectDownloadQuality } from '@/features/settings/playback/state';
import { useApi } from '@/providers/registry/useApi';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { collectionDownloadState } from './downloadPolicies';
import { createDownloadProgress, type DownloadProgressType } from './downloadProgress';
import type { DownloadedCollectionEntry } from './downloadStore';
import { mayDownloadNow } from './networkPolicy';
import { createOfflineDownloader } from './offlineDownloader';
import { createOfflineStore } from './offlineStore';
import { normalizeLocalUri, type LocalDownloadedTrackEntry } from './restore';
import { streamSourceId } from './streamId';
import { useOfflineCommands, type DownloadActionsType } from './useOfflineCommands';
import { useOfflineLifecycle } from './useOfflineLifecycle';

/** What is on this device, for drawing. Track ids are `localId`s. */
type DownloadStateType = {
  /** Stable: depend on `downloadedTrackCount` to recompute when a track lands. */
  isTrackDownloaded: (trackId: string) => boolean;
  isTrackDownloading: (trackId: string) => boolean;
  getCollectionDownloadState: (trackIds: string[]) => { isDownloaded: boolean; isDownloading: boolean };
  getAllDownloadedTracks: () => LocalDownloadedTrackEntry[];
  getAllDownloadedCollections: () => DownloadedCollectionEntry[];
  downloadedTracks: LocalDownloadedTrackEntry[];
  totalDownloadedBytes: number;
  downloadedTrackCount: number;
};

const DownloadActionsContext = createContext<DownloadActionsType | undefined>(undefined);
const DownloadStateContext = createContext<DownloadStateType | undefined>(undefined);
// Its own context: progress changes several times a second during a
// download, and only progress rings should redraw for it.
const DownloadProgressContext = createContext<DownloadProgressType | undefined>(undefined);

export const useDownloadActions = (): DownloadActionsType => {
  const ctx = useContext(DownloadActionsContext);
  if (!ctx) throw new Error('useDownloadActions must be used within DownloadProvider');
  return ctx;
};

export const useDownloadState = (): DownloadStateType => {
  const ctx = useContext(DownloadStateContext);
  if (!ctx) throw new Error('useDownloadState must be used within DownloadProvider');
  return ctx;
};

/** Only for components that draw live progress — it updates on every flush. */
export const useDownloadProgress = (): DownloadProgressType => {
  const ctx = useContext(DownloadProgressContext);
  if (!ctx) throw new Error('useDownloadProgress must be used within DownloadProvider');
  return ctx;
};

/** Actions and state together. Render-sensitive components should take only the half they need. */
export const useDownload = (): DownloadActionsType & DownloadStateType => {
  const actions = useDownloadActions();
  const state = useDownloadState();
  return useMemo(() => ({ ...actions, ...state }), [actions, state]);
};

/**
 * Offline downloads for the whole app.
 *
 * The records live in one offline store, transfers in the downloader, and live
 * progress in its own tracker; this wires them to the app's settings and
 * publishes three contexts, so a consumer redraws only for the part it reads.
 */
export const DownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const api = useLatestRef(useApi());
  const downloadQuality = useLatestRef(useSelector(selectDownloadQuality));
  const activeServer = useLatestRef(useSelector(selectActiveServer));
  const wifiOnly = useSelector(selectDownloadOnWifiOnly);
  const networkType = useNetworkType();
  const network = useLatestRef({ wifiOnly, networkType });
  const translate = useLatestRef(t);

  const [store] = useState(() => createOfflineStore({ documentDirectory: FileSystem.documentDirectory ?? null }));
  const [progress] = useState(() => createDownloadProgress());
  const [downloader] = useState(() => createOfflineDownloader({
    store,
    progress,
    resolveTrack: async track => {
      const song = await api.current.tracks.get(track.nativeId).catch(() => null);
      if (!song) return null;
      const streamUrl = api.current.songs.buildStreamUrl(streamSourceId(song), downloadQuality.current);
      return streamUrl ? { song, streamUrl } : null;
    },
    requestHeaders: streamUrl => mediaHeadersForSong(activeServer.current, { streamUrl }).headers,
    activeServer: () => activeServer.current,
    mayDownload: () => mayDownloadNow(network.current),
    onJobDropped: job => notify.error(translate.current('downloads.jobFailed', { title: job.tracks[0]?.title ?? '' })),
  }));

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const liveProgress = useSyncExternalStore(progress.subscribe, progress.getSnapshot);
  const actions = useOfflineCommands(store, downloader);
  useOfflineLifecycle(store, downloader, progress, { wifiOnly, networkType });

  const { tracks, collections, jobs, downloading } = snapshot;
  const downloadedTracks = useMemo(
    () => tracks.map(track => ({ ...track, localPath: normalizeLocalUri(track.localPath) })),
    [tracks]
  );
  const downloadedIds = useMemo(() => new Set(tracks.map(track => track.trackId)), [tracks]);
  const queuedIds = useMemo(() => new Set(jobs.flatMap(job => job.tracks.map(track => track.localId))), [jobs]);
  const totalDownloadedBytes = useMemo(() => tracks.reduce((sum, track) => sum + track.fileSize, 0), [tracks]);

  const isTrackDownloading = useCallback((trackId: string) => downloading.has(trackId), [downloading]);
  const getCollectionDownloadState = useCallback(
    (trackIds: string[]) => collectionDownloadState(trackIds, downloadedIds, downloading, queuedIds),
    [downloadedIds, downloading, queuedIds]
  );

  const state = useMemo<DownloadStateType>(() => ({
    isTrackDownloaded: store.isDownloaded,
    isTrackDownloading,
    getCollectionDownloadState,
    getAllDownloadedTracks: () => downloadedTracks,
    getAllDownloadedCollections: () => collections,
    downloadedTracks,
    totalDownloadedBytes,
    downloadedTrackCount: tracks.length,
  }), [collections, downloadedTracks, getCollectionDownloadState, isTrackDownloading, store, totalDownloadedBytes, tracks.length]);

  return (
    <DownloadActionsContext.Provider value={actions}>
      <DownloadStateContext.Provider value={state}>
        <DownloadProgressContext.Provider value={liveProgress}>
          {children}
        </DownloadProgressContext.Provider>
      </DownloadStateContext.Provider>
    </DownloadActionsContext.Provider>
  );
};
