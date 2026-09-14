import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { notify } from '@/components/toast';
import { useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import type { Song } from '@/domain/entities/Song';
import { DownloadProviderScope } from '@/utils/downloads/provider';
import {
  DownloadedCollectionEntry,
  DownloadedTrackEntry,
} from '@/utils/downloads/downloadStore';
import {
  readDownloadsSnapshot,
  readResumables,
  PersistedDownloadJob,
  type PersistedResumable,
  writeDownloadedCollections,
  writeDownloadJobs,
  writeDownloadedTracks,
  writeResumables,
} from '@/utils/downloads/localDownloadStore';
import {
  expiredResumables,
  findUsableResumable,
  removeResumable,
  stagingPathsToKeep,
  upsertResumable,
} from '@/utils/downloads/resumeState';
import {
  createDownloadJobRunner,
} from '@/utils/downloads/jobQueue';
import {
  collectionsWithoutTracks,
  jobMatchesCollectionId,
  jobMatchesDownloadId,
  jobsOutsideScope,
  evictFromPlayerCache,
  orphanedTrackIds,
  trackIdsOfJobs,
  tracksInCollectionRemoval,
  tracksInScope,
  tracksWithout,
} from '@/utils/downloads/removal';
import {
  DOWNLOAD_SCHEMA_VERSION,
  extensionFromContentType,
  headerValue,
  normalizeLocalUri,
  restoreDownloadState,
  sanitizeFileName,
  type LocalDownloadedTrackEntry,
} from '@/utils/downloads/restore';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { mediaHeadersForSong } from '@/features/player/mediaHeaders';
import { selectDownloadOnWifiOnly } from '@/features/settings/downloads/state';
import { selectDownloadQuality } from '@/features/settings/playback/state';
import { useNetworkType } from '@/features/connectivity/useNetworkType';
import { streamSourceId } from '@/utils/playback/streamId';
import {
  BACKGROUND_FILE_OPTIONS,
  DOWNLOAD_DIR,
  FOREGROUND_FILE_OPTIONS,
  buildStagingPath,
  cleanupStagingFiles,
  deleteDownloadedFiles,
  ensureDownloadDir,
} from '@/features/offline/filesystem';
import { getBackend } from '@/features/player/activeBackend';
import { downloadProgressFraction, nextDownloadingIds, collectionDownloadState } from '@/features/offline/downloadPolicies';
import { mayDownloadNow } from '@/features/offline/networkPolicy';

/**
 * A track together with the URL to fetch its bytes from.
 *
 * `Song` never carries a stream URL — it's credentialled, unsafe to persist,
 * and goes stale with the session (see `Song.streamId` doc). Downloading
 * needs actual bytes, so this pairs the entity with a URL built on demand via
 * `api.songs.buildStreamUrl`, right before it's used, instead of splicing a
 * URL onto the entity the way this file used to.
 */
export interface DownloadableTrack {
  song: Song;
  streamUrl: string;
}

export type DownloadedTrack = DownloadedTrackEntry & {
  localPath: string;
  originalTrack?: {
    id?: string;
    extraPayload?: {
      serverId?: string;
      serverType?: string;
      coverKind?: string;
    };
  };
};

// Stable operations — reference never changes after mount.
export type DownloadActionsType = {
  configure: (config: Record<string, unknown>) => void;
  downloadTrack: (track: Song, playlistId?: string) => Promise<void>;
  /** Enqueue a batch of standalone tracks as a single download job. */
  downloadTracks: (tracks: Song[]) => Promise<void>;
  downloadPlaylist: (playlistId: string, tracks: Song[]) => Promise<void>;
  resumeDownload: (downloadId: string) => Promise<void>;
  cancelDownload: (downloadId: string) => Promise<void>;
  deleteDownloadedTrack: (trackId: string) => Promise<void>;
  setPlaybackSourcePreference: (pref: 'auto' | 'download' | 'network') => void;
  downloadAlbumById: (albumId: string, songs?: Song[]) => Promise<void>;
  downloadPlaylistById: (playlistId: string, songs?: Song[]) => Promise<void>;
  cancelCollectionDownloads: (collectionId: string) => Promise<void>;
  removeDownloadByCollectionId: (id: string, trackIds: string[], scope?: DownloadProviderScope) => Promise<void>;
  cancelDownloadAll: () => Promise<void>;
  clearDownloadsForProvider: (scope?: DownloadProviderScope) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  // Stable O(1) lookup via internal Map ref — safe for playback resolution.
  getLocalPath: (trackId: string) => string | null;
};

// Reactive state — updates when downloads change.
export type DownloadStateType = {
  isTrackDownloaded: (trackId: string) => boolean;
  isTrackDownloading: (trackId: string) => boolean;
  getCollectionDownloadState: (trackIds: string[]) => { isDownloaded: boolean; isDownloading: boolean };
  getAllDownloadedTracks: () => DownloadedTrack[];
  getAllDownloadedCollections: () => DownloadedCollectionEntry[];
  getStorageInfo: () => Promise<{ totalBytes: number; downloadedTracks: number; availableBytes?: number }>;
  getSongLocalUri: (songId: string) => Promise<string | null>;
  downloadedTracks: DownloadedTrack[];
  downloadStateVersion: number;
  totalDownloadedBytes: number;
  downloadedTrackCount: number;
};

// Backward-compatible combined type.
export type DownloadContextType = DownloadActionsType & DownloadStateType;

// trackId → fraction in [0, 1], or -1 when the server streams without a
// Content-Length (transcoded streams) and the total is unknown.
// Split into its own context: it updates on every progress tick during an
// active download, and bundling it into DownloadStateContext re-rendered
// every consumer of useDownloadState() (every SongRow, TrackItem, etc. in
// the visible list) on each tick even though most only read
// isTrackDownloaded/isTrackDownloading.
export type DownloadProgressType = Record<string, number>;

const DownloadActionsContext = createContext<DownloadActionsType | undefined>(undefined);
const DownloadStateContext = createContext<DownloadStateType | undefined>(undefined);
const DownloadProgressContext = createContext<DownloadProgressType | undefined>(undefined);

const MAX_JOB_ATTEMPTS = 5;

type DownloadState = {
  tracks: LocalDownloadedTrackEntry[];
  collections: DownloadedCollectionEntry[];
  jobs: PersistedDownloadJob[];
};

/**
 * What the restore produced: the state to render, and the files it orphaned.
 *
 * The two are returned together because they are discovered together. The
 * paths used to be handed over in a module-level `let`, written by this
 * function and read by an effect a hundred lines away — a channel with no type
 * on it, no way to see from either end that the other existed, and exactly one
 * consumer that had to run before anything else touched it.
 */
type InitialDownloadState = {
  state: DownloadState;
  /** Files of entries the restore dropped, for the caller to delete. */
  stalePaths: string[];
};

function loadInitialState(): InitialDownloadState {
  const snapshot = readDownloadsSnapshot();
  const restored = restoreDownloadState(snapshot, FileSystem.documentDirectory ?? null);

  if (restored.changed) {
    writeDownloadedTracks(restored.tracks);
    writeDownloadedCollections(restored.collections);
  }

  return {
    state: {
      tracks: restored.tracks,
      collections: restored.collections,
      jobs: restored.jobs,
    },
    stalePaths: restored.stalePaths,
  };
}

function persistTracks(tracks: LocalDownloadedTrackEntry[]) {
  writeDownloadedTracks(tracks);
}

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

// Subscribe to this only from components that render live progress (e.g. a
// progress ring) — it updates on every tick during an active download.
export const useDownloadProgress = (): DownloadProgressType => {
  const ctx = useContext(DownloadProgressContext);
  if (!ctx) throw new Error('useDownloadProgress must be used within DownloadProvider');
  return ctx;
};

// Backward-compatible hook — prefer useDownloadActions or useDownloadState for new code.
export const useDownload = (): DownloadContextType => {
  const actions = useDownloadActions();
  const state = useDownloadState();
  return useMemo(() => ({ ...actions, ...state }), [actions, state]);
};

export const DownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const downloadQuality = useSelector(selectDownloadQuality);
  const localPathMapRef = useRef<Map<string, string>>(new Map());
  // Files the restore orphaned, deleted once on mount. A ref rather than
  // state: nothing renders from it and it is consumed exactly once.
  const stalePathsRef = useRef<string[]>([]);
  const [state, setState] = useState<DownloadState>(() => {
    const initial = loadInitialState();
    const map = new Map<string, string>();
    for (const track of initial.state.tracks) {
      map.set(track.trackId, normalizeLocalUri(track.localPath));
    }
    localPathMapRef.current = map;
    stalePathsRef.current = initial.stalePaths;
    return initial.state;
  });
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  /**
   * The queue's own view of the jobs, read without re-rendering.
   *
   * Genuinely a pair with `state.jobs`, not a mirror of it: the queue runs
   * outside React and must see an edit immediately — `processDownloadQueue`
   * reads this between awaits — while `getCollectionDownloadState` has to
   * re-render when it changes. `updateJobs` writes both, in that order, and is
   * the only writer.
   *
   * There used to be an effect assigning `jobsRef.current = state.jobs` on
   * every change, which made a second writer for a value its own updater
   * already maintained: a ref written both synchronously by the code that
   * changed it and again, later, by a render it did not control.
   */
  const jobsRef = useRef<PersistedDownloadJob[]>(state.jobs);
  const jobRunnerRef = useRef(createDownloadJobRunner<Song, PersistedDownloadJob>());
  const activeDownloadsRef = useRef<Map<string, FileSystem.DownloadResumable>>(new Map());
  const progressRef = useRef<Record<string, number>>({});
  const progressFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read through refs so the queue's identity doesn't change every time the
  // radio flips — `processDownloadQueue` is a dependency of half this file.
  const wifiOnly = useSelector(selectDownloadOnWifiOnly);
  const networkType = useNetworkType();
  const wifiOnlyRef = useRef(wifiOnly);
  const networkTypeRef = useRef(networkType);
  wifiOnlyRef.current = wifiOnly;
  networkTypeRef.current = networkType;

  // Saved state for downloads that were interrupted part-way. Held in a ref
  // rather than state: nothing renders from it, and it is written from inside
  // the queue, which must not re-run because of its own bookkeeping.
  const resumablesRef = useRef<PersistedResumable[]>(readResumables());
  const setResumables = useCallback((next: PersistedResumable[]) => {
    resumablesRef.current = next;
    writeResumables(next);
  }, []);

  // Drop the files of entries the restore pruned. Best-effort and not awaited:
  // a file that will not delete is wasted space, and blocking the provider's
  // mount on it would be worse than the space.
  useEffect(() => {
    const stalePaths = stalePathsRef.current;
    stalePathsRef.current = [];
    if (!stalePaths.length) return;

    void Promise.all(stalePaths.map(path =>
      FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {})
    ));
  }, []);

  useEffect(() => () => {
    if (progressFlushTimerRef.current) clearTimeout(progressFlushTimerRef.current);
  }, []);

  // Batches progress callbacks (which fire on every write) into at most ~3
  // state updates per second so a 3-track chunk doesn't re-render the tree
  // on every network buffer.
  const reportDownloadProgress = useCallback((trackId: string, written: number, expected: number) => {
    const fraction = downloadProgressFraction(written, expected);
    progressRef.current = { ...progressRef.current, [trackId]: fraction };
    if (progressFlushTimerRef.current) return;
    progressFlushTimerRef.current = setTimeout(() => {
      progressFlushTimerRef.current = null;
      setDownloadProgress(progressRef.current);
    }, 350);
  }, []);

  const clearDownloadProgress = useCallback((trackId: string) => {
    if (!(trackId in progressRef.current)) return;
    const { [trackId]: _removed, ...rest } = progressRef.current;
    progressRef.current = rest;
    setDownloadProgress(rest);
  }, []);

  // Verify file existence on mount and purge entries whose files are missing.
  // This handles cases where the app was reinstalled or files were deleted
  // externally while the download metadata survived in MMKV.
  useEffect(() => {
    const verify = async () => {
      const tracks = state.tracks;
      if (!tracks.length) return;

      const results = await Promise.all(
        tracks.map(async track => {
          const info = await FileSystem.getInfoAsync(track.localPath).catch(() => ({ exists: false }));
          return info.exists ? null : track.trackId;
        })
      );

      const missingIds = results.filter((id): id is string => id !== null);
      if (!missingIds.length) return;

      const missing = new Set(missingIds);
      updateTracks(t => t.filter(track => !missing.has(track.trackId)));
      updateCollections(cols =>
        cols
          .map(col => ({ ...col, trackIds: col.trackIds.filter(id => !missing.has(id)) }))
          .filter(col => col.trackIds.length > 0)
      );
    };

    void verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTracks = useCallback((updater: (tracks: LocalDownloadedTrackEntry[]) => LocalDownloadedTrackEntry[]) => {
    setState(current => {
      const tracks = updater(current.tracks);
      persistTracks(tracks);
      const map = new Map<string, string>();
      for (const track of tracks) {
        map.set(track.trackId, normalizeLocalUri(track.localPath));
      }
      localPathMapRef.current = map;
      return { ...current, tracks };
    });
  }, []);

  const updateCollections = useCallback((updater: (collections: DownloadedCollectionEntry[]) => DownloadedCollectionEntry[]) => {
    setState(current => {
      const collections = updater(current.collections);
      writeDownloadedCollections(collections);
      return { ...current, collections };
    });
  }, []);

  const updateJobs = useCallback((updater: (jobs: PersistedDownloadJob[]) => PersistedDownloadJob[]) => {
    const jobs = updater(jobsRef.current);
    jobsRef.current = jobs;
    writeDownloadJobs(jobs);
    setState(current => ({ ...current, jobs }));
  }, []);

  // Stable O(1) lookup — reads from ref kept in sync inside updateTracks.
  const getLocalPath = useCallback((trackId: string): string | null => {
    return localPathMapRef.current.get(trackId) ?? null;
  }, []);

  const isTrackDownloaded = useCallback(
    (trackId: string) => localPathMapRef.current.has(trackId),
    [], // ref reads never need deps — localPathMapRef.current is always current
  );

  const isTrackDownloading = useCallback(
    (trackId: string) => downloadingIds.has(trackId),
    [downloadingIds]
  );

  const setTrackDownloading = useCallback((trackId: string, downloading: boolean) => {
    setDownloadingIds(current => nextDownloadingIds(current, trackId, downloading));
  }, []);


  /**
   * Looks the track up fresh and builds a URL to fetch it from right now.
   *
   * A queued job can sit for a long time (Wi-Fi-only, paused, backgrounded),
   * so the URL is never trusted from enqueue time — it's credentialled and
   * goes stale with the session. `track.id` is the id the queue stores the
   * job under, which — for anything that reached the queue through this file
   * The queue stores whole domain songs, so the id to send back to the origin
   * is simply the track's `nativeId`; everything the download itself is keyed
   * by — staging paths, resumables, progress, the on-disk index — uses
   * `localId`, because two servers can each call a track `42`.
   */
  const resolveTrack = useCallback(async (track: Song): Promise<DownloadableTrack | null> => {
    const song = await api.tracks.get(track.nativeId).catch(() => null);
    if (!song) return null;
    const streamUrl = api.songs.buildStreamUrl(
      streamSourceId(song),
      downloadQuality,
    );
    return streamUrl ? { song, streamUrl } : null;
  }, [api, downloadQuality]);

  // The music server transcodes server-side (format/maxBitRate on the stream
  // URL — see qualityToStreamParams), so a single direct download replaces the
  // old download→upload-to-rawarr→transcode→re-download round trip.
  const performDownloadTrack = useCallback(async (track: Song, collectionId?: string) => {
    if (isTrackDownloaded(track.localId) || isTrackDownloading(track.localId)) return;

    const resolved = await resolveTrack(track);
    if (!resolved) {
      throw new Error('Track stream URL unavailable');
    }
    const { song: freshSong, streamUrl } = resolved;

    await ensureDownloadDir();
    setTrackDownloading(track.localId, true);
    const stagingPath = buildStagingPath(track);

    try {
      // Bytes already on disk from a run that was cut short. Only usable
      // against the very same URL — see findUsableResumable.
      const saved = findUsableResumable(
        resumablesRef.current,
        track.localId,
        streamUrl,
      );

      // A header-authenticated server (Plex behind Basic auth) rejects a bare
      // download URL — the credentials ride in a request header, not the query
      // string. Attach them to the file-download session the same way playback
      // does, resolved against the active server. Unprotected servers add none.
      // `sourceServerType` is deliberately omitted: a domain Song's
      // provenance carries which server it came from, not that server's
      // type, so this falls straight to `server?.type` inside
      // mediaHeadersForSong — the same value `activeServer?.type` resolves to
      // below, since a download only ever runs against the active server.
      const requestHeaders = mediaHeadersForSong(activeServer, { streamUrl }).headers;

      const runWithSession = async (options: typeof BACKGROUND_FILE_OPTIONS) => {
        const resumable = FileSystem.createDownloadResumable(
          streamUrl,
          stagingPath,
          requestHeaders ? { ...options, headers: requestHeaders } : options,
          progress => reportDownloadProgress(
            track.localId,
            progress.totalBytesWritten,
            progress.totalBytesExpectedToWrite,
          ),
          saved?.resumeData,
        );
        activeDownloadsRef.current.set(track.localId, resumable);
        return saved
          ? await resumable.resumeAsync()
          : await resumable.downloadAsync();
      };

      let result;
      try {
        result = await runWithSession(BACKGROUND_FILE_OPTIONS);
      } catch (error) {
        // Every task on a session whose daemon is unreachable fails, so a
        // second attempt on the same session type would fail identically.
        // Drop to a foreground session once before giving up.
        console.warn(
          `Background download session failed for track ${track.localId}; retrying in the foreground`,
          error,
        );
        result = await runWithSession(FOREGROUND_FILE_OPTIONS);
      }
      // downloadAsync resolves undefined when cancelAsync() was called —
      // not an error, just nothing to record.
      if (!result) return;
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Download failed (${result.status})`);
      }

      const extension = extensionFromContentType(headerValue(result.headers, 'Content-Type'));
      const localPath = `${DOWNLOAD_DIR}${sanitizeFileName(track.localId)}.${extension}`;
      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      await FileSystem.moveAsync({ from: stagingPath, to: localPath });

      const info = await FileSystem.getInfoAsync(localPath);
      const fileSize = info.exists ? info.size : 0;
      // The freshly resolved song's own provenance is the ground truth for
      // which server this came from; the active server is only a fallback
      // for the (external/non-server) case where provenance has no serverId.
      const serverId = (freshSong.provenance.origin === 'server' ? freshSong.provenance.serverId : undefined)
        ?? activeServer?.id ?? '';
      const serverType = activeServer?.type ?? '';
      const entry: LocalDownloadedTrackEntry = {
        trackId: track.localId,
        localPath,
        fileSize,
        downloadedAt: Date.now(),
        albumId: track.album.localId,
        artistId: track.artist.localId,
        serverId,
        serverType,
        coverKind: track.cover.kind,
        schemaVersion: DOWNLOAD_SCHEMA_VERSION,
        title: track.title,
        originalTrack: {
          id: track.localId,
          extraPayload: {
            serverId,
            serverType,
            coverKind: track.cover.kind,
          },
        },
      };

      // The file is whole and moved; there is nothing left to resume.
      setResumables(removeResumable(resumablesRef.current, track.localId));

      updateTracks(tracks => [
        ...tracks.filter(existing => existing.trackId !== track.localId),
        entry,
      ]);

      if (collectionId) {
        updateCollections(collections => {
          const existing = collections.find(collection => collection.id === collectionId);
          if (!existing) return collections;
          return collections.map(collection => (
            collection.id === collectionId
              ? { ...collection, trackIds: [...new Set([...collection.trackIds, track.localId])] }
              : collection
          ));
        });
      }
    } finally {
      activeDownloadsRef.current.delete(track.localId);
      clearDownloadProgress(track.localId);

      // Normally the staging file is scratch and goes. The exception is a
      // download we paused on purpose and saved state for — deleting that
      // here would throw away the very bytes the pause existed to keep.
      const held = resumablesRef.current.some(
        saved => saved.trackId === track.localId && saved.resumeData
      );
      if (!held) {
        await FileSystem.deleteAsync(stagingPath, { idempotent: true }).catch(() => {});
      }
      setTrackDownloading(track.localId, false);
    }
  }, [activeServer, clearDownloadProgress, isTrackDownloaded, isTrackDownloading, reportDownloadProgress, resolveTrack, setResumables, setTrackDownloading, updateCollections, updateTracks]);

  const removeJob = useCallback((jobId: string) => {
    updateJobs(jobs => jobs.filter(job => job.id !== jobId));
  }, [updateJobs]);

  /**
   * Write down where every in-flight download had got to, so the next launch
   * can carry on from those bytes instead of fetching them again.
   *
   * `pauseAsync` is what produces the resume token, and it resolves the
   * in-flight `downloadAsync` with undefined — the same shape as a cancel —
   * so `performDownloadTrack` treats it as "nothing to record" and leaves the
   * staging file alone, which is exactly what is wanted here.
   */
  const pauseActiveDownloads = useCallback(async () => {
    const active = [...activeDownloadsRef.current.entries()];
    if (!active.length) return;

    const saved = await Promise.all(active.map(async ([trackId, resumable]): Promise<PersistedResumable | null> => {
      try {
        const state = await resumable.pauseAsync();
        if (!state.resumeData) return null;
        return {
          trackId,
          url: state.url,
          fileUri: state.fileUri,
          resumeData: state.resumeData,
          savedAt: Date.now(),
        };
      } catch {
        // A download that had already finished or failed has nothing to
        // pause; it simply isn't resumable and starts over if retried.
        return null;
      }
    }));

    const next = saved
      .filter((entry): entry is PersistedResumable => entry !== null)
      .reduce(upsertResumable, resumablesRef.current);
    setResumables(next);
  }, [setResumables]);

  const CONCURRENT_TRACK_DOWNLOADS = 3;

  const processDownloadQueue = useCallback(async () => {
    // Downloads are the one thing the app does that can run up a phone bill
    // without anyone asking for it — auto-download fires off a library sync,
    // not off a tap. Jobs stay queued and persisted, so the queue drains on
    // its own once WiFi is back; nothing is lost by waiting.
    if (!mayDownloadNow({
      wifiOnly: wifiOnlyRef.current,
      networkType: networkTypeRef.current,
    })) return;

    await jobRunnerRef.current.run({
      getJobs: () => jobsRef.current,
      downloadTrack: (track, collectionId) => performDownloadTrack(track, collectionId),
      onJobComplete: job => removeJob(job.id),
      onJobRescheduled: (job, attempts) => {
        console.warn(`Download job ${job.id} still failing after in-run retries; queued for the next pass (attempt ${attempts}/${MAX_JOB_ATTEMPTS})`);
        updateJobs(jobs => jobs.map(existing => (
          existing.id === job.id
            ? { ...existing, attempts, updatedAt: Date.now() }
            : existing
        )));
      },
      onJobDropped: (job, attempts) => {
        console.warn(`Download job ${job.id} dropped after ${attempts} failed attempts`);
        removeJob(job.id);
        // `externalAlbum.download.failed` used to be reused here. That string
        // belongs to the download-to-server flow, so a local album that gave
        // up said "Download failed." with no subject and no next step, on a
        // screen that has nothing to do with an external downloader.
        notify.error(t('downloads.jobFailed', {
          title: job.tracks[0]?.title ?? '',
        }));
      },
      prepare: async () => {
        await ensureDownloadDir();
        // Drop the saved state that has aged out first, so its staging file
        // falls out of `keep` and gets collected in the same sweep.
        const stale = expiredResumables(resumablesRef.current);
        if (stale.length) {
          setResumables(stale.reduce(
            (list, entry) => removeResumable(list, entry.trackId),
            resumablesRef.current,
          ));
        }
        await cleanupStagingFiles(stagingPathsToKeep(resumablesRef.current));
      },
      concurrency: CONCURRENT_TRACK_DOWNLOADS,
      maxAttempts: MAX_JOB_ATTEMPTS,
    });
  }, [performDownloadTrack, removeJob, setResumables, t, updateJobs]);

  const enqueueDownloadJob = useCallback(async (job: Omit<PersistedDownloadJob, 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    updateJobs(jobs => {
      const existing = jobs.find(existingJob => existingJob.id === job.id);
      const nextJob: PersistedDownloadJob = {
        ...job,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      return [
        ...jobs.filter(existingJob => existingJob.id !== job.id),
        nextJob,
      ];
    });

    await processDownloadQueue();
  }, [processDownloadQueue, updateJobs]);

  const downloadTrack = useCallback(async (track: Song, collectionId?: string) => {
    await enqueueDownloadJob({
      id: `track:${track.nativeId}`,
      type: 'track',
      collectionId,
      tracks: [track],
    });
  }, [enqueueDownloadJob]);

  const downloadTracks = useCallback(async (tracks: Song[]) => {
    const pending = tracks.filter(track =>
      !localPathMapRef.current.has(track.nativeId)
    );
    if (!pending.length) return;
    await enqueueDownloadJob({
      id: `tracks:${Date.now()}`,
      type: 'track',
      tracks: pending,
    });
  }, [enqueueDownloadJob]);

  const downloadCollection = useCallback(async (
    collectionId: string,
    type: DownloadedCollectionEntry['type'],
    tracks: Song[],
  ) => {
    const trackIds = tracks.map(track => track.nativeId);
    updateCollections(collections => [
      ...collections.filter(collection => collection.id !== collectionId),
      {
        id: collectionId,
        type,
        trackIds,
        downloadedAt: Date.now(),
      },
    ]);

    await enqueueDownloadJob({
      id: `${type}:${collectionId}`,
      type,
      collectionId,
      tracks,
    });
  }, [enqueueDownloadJob, updateCollections]);

  // The old success toast fired unconditionally — allSettled swallowed every
  // per-track rejection, so users saw "download complete" over an empty
  // downloads list. Verify what actually landed before claiming success.
  const toastCollectionResult = useCallback((tracks: Song[], label: string) => {
    const downloadedCount = tracks.filter(track => localPathMapRef.current.has(track.nativeId)).length;
    if (downloadedCount === tracks.length) {
      notify.success(t('settings.downloaders.downloadComplete'));
    } else {
      console.warn(`${label} download incomplete: ${downloadedCount}/${tracks.length} tracks`);
      notify.error(t('externalAlbum.download.failed'));
    }
  }, [t]);

  const downloadAlbumById = useCallback(async (albumId: string, songs?: Song[]) => {
    // AlbumsApi.get always resolves an AlbumDetail (never null) — the old
    // optional-chaining here was for a shape that no longer exists.
    const tracks = songs?.length
      ? songs
      : (await api.albums.get(albumId)).songs;
    if (!tracks.length) return;

    try {
      await downloadCollection(albumId, 'album', tracks);
      toastCollectionResult(tracks, 'Album');
    } catch (error) {
      console.warn('Album download failed', error);
      notify.error(t('externalAlbum.download.failed'));
    }
  }, [api, downloadCollection, t, toastCollectionResult]);

  const downloadPlaylistById = useCallback(async (playlistId: string, songs?: Song[]) => {
    // PlaylistsApi.get always resolves a PlaylistDetail (never null) — same
    // shape change as downloadAlbumById above.
    const tracks = songs?.length
      ? songs
      : (await api.playlists.get(playlistId)).songs;
    if (!tracks.length) return;

    try {
      await downloadCollection(playlistId, 'playlist', tracks);
      toastCollectionResult(tracks, 'Playlist');
    } catch (error) {
      console.warn('Playlist download failed', error);
      notify.error(t('externalAlbum.download.failed'));
    }
  }, [api, downloadCollection, t, toastCollectionResult]);

  const downloadPlaylist = useCallback(
    (playlistId: string, tracks: Song[]) => downloadPlaylistById(playlistId, tracks),
    [downloadPlaylistById]
  );

  // Aborts in-flight transfers for tracks that no longer belong to any queued
  // job. Cancelled resumables resolve undefined in performDownloadTrack, so
  // nothing gets recorded and the staging file is cleaned up there.
  const cancelOrphanedActiveDownloads = useCallback(async (candidateTrackIds: Iterable<string>) => {
    const orphans = orphanedTrackIds(candidateTrackIds, jobsRef.current);
    await Promise.all(orphans.map(trackId => {
      const resumable = activeDownloadsRef.current.get(trackId);
      return resumable ? resumable.cancelAsync().catch(() => {}) : Promise.resolve();
    }));

    // Nobody is coming back for these bytes. Dropping the saved state also
    // releases the staging file, which the pre-pass sweep was holding on to
    // precisely because state existed for it.
    if (orphans.length) {
      setResumables(orphans.reduce(removeResumable, resumablesRef.current));
    }
  }, [setResumables]);

  /**
   * Every deletion path goes through here, which is why the eviction does too:
   * a track is only really gone once the engine's cached copy is gone with it.
   * See `evictFromPlayerCache` for why it is best-effort.
   */
  const deleteFiles = useCallback(async (tracks: LocalDownloadedTrackEntry[]) => {
    await deleteDownloadedFiles(tracks.map(track => track.localPath));
    evictFromPlayerCache(tracks, mediaId => getBackend().evict(mediaId));
  }, []);

  const deleteDownloadedTrack = useCallback(async (trackId: string) => {
    const entry = state.tracks.find(track => track.trackId === trackId);
    if (entry) await deleteFiles([entry]);

    const removed = new Set([trackId]);
    updateTracks(tracks => tracksWithout(tracks, removed));
    updateCollections(collections => collectionsWithoutTracks(collections, removed));
  }, [deleteFiles, state.tracks, updateCollections, updateTracks]);

  const removeDownloadByCollectionId = useCallback(async (
    id: string,
    trackIds: string[],
    scope?: DownloadProviderScope,
  ) => {
    const tracksToDelete = tracksInCollectionRemoval(state.tracks, trackIds, scope);
    await deleteFiles(tracksToDelete);

    const removed = new Set(tracksToDelete.map(track => track.trackId));
    updateTracks(tracks => tracksWithout(tracks, removed));
    updateCollections(collections => collections.filter(collection => collection.id !== id));
    updateJobs(jobs => jobs.filter(job => !jobMatchesCollectionId(job, id)));
    await cancelOrphanedActiveDownloads(trackIds);
  }, [cancelOrphanedActiveDownloads, deleteFiles, state.tracks, updateCollections, updateJobs, updateTracks]);

  const clearDownloadsForProvider = useCallback(async (scope?: DownloadProviderScope) => {
    const tracksToDelete = tracksInScope(state.tracks, scope);
    await deleteFiles(tracksToDelete);

    const removed = new Set(tracksToDelete.map(track => track.trackId));
    updateTracks(tracks => tracksWithout(tracks, removed));
    updateCollections(collections => collectionsWithoutTracks(collections, removed));
    updateJobs(jobs => jobsOutsideScope(jobs, scope));
  }, [deleteFiles, state.tracks, updateCollections, updateJobs, updateTracks]);

  const clearAllDownloads = useCallback(async () => {
    await deleteFiles(state.tracks);
    updateTracks(() => []);
    updateCollections(() => []);
    updateJobs(() => []);
  }, [deleteFiles, state.tracks, updateCollections, updateJobs, updateTracks]);

  const cancelDownload = useCallback(async (downloadId: string) => {
    const cancelledTrackIds = trackIdsOfJobs(
      jobsRef.current.filter(job => jobMatchesDownloadId(job, downloadId))
    );

    updateJobs(jobs => jobs.filter(job => !jobMatchesDownloadId(job, downloadId)));
    await cancelOrphanedActiveDownloads(cancelledTrackIds);
  }, [cancelOrphanedActiveDownloads, updateJobs]);

  const cancelCollectionDownloads = useCallback(async (collectionId: string) => {
    const cancelledTrackIds = trackIdsOfJobs(
      jobsRef.current.filter(job => jobMatchesCollectionId(job, collectionId))
    );

    updateJobs(jobs => jobs.filter(job => !jobMatchesCollectionId(job, collectionId)));
    await cancelOrphanedActiveDownloads(cancelledTrackIds);
  }, [cancelOrphanedActiveDownloads, updateJobs]);

  const cancelDownloadAll = useCallback(async () => {
    updateJobs(() => []);
    await cancelOrphanedActiveDownloads(activeDownloadsRef.current.keys());
  }, [cancelOrphanedActiveDownloads, updateJobs]);

  const resumeDownload = useCallback(async (downloadId: string) => {
    const hasJob = jobsRef.current.some(job => jobMatchesDownloadId(job, downloadId));
    if (hasJob) {
      await processDownloadQueue();
    }
  }, [processDownloadQueue]);

  const getCollectionDownloadState = useCallback((trackIds: string[]) => {
    const downloadedIds = new Set(state.tracks.map(track => track.trackId));
    const queuedIds = new Set(state.jobs.flatMap(job => job.tracks.map(track => track.localId)));
    return collectionDownloadState(
      trackIds,
      downloadedIds,
      downloadingIds,
      queuedIds,
    );
  }, [downloadingIds, isTrackDownloaded, isTrackDownloading, state.jobs, state.tracks]);

  useEffect(() => {
    if (!jobRunnerRef.current.isRunning()) {
      // Keep the partials a resumable still points at. Sweeping with no
      // exceptions is what this did, and it ran on every launch — deleting the
      // very bytes `PersistedResumable` exists to preserve, so an interrupted
      // 40MB track silently started again from zero on the next open. It never
      // looked like a bug: the download worked, it was just slower and the
      // data was spent twice.
      cleanupStagingFiles(stagingPathsToKeep(resumablesRef.current)).catch(() => {});
    }

    if (jobsRef.current.length > 0) {
      void processDownloadQueue();
    }

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && jobsRef.current.length > 0) {
        void processDownloadQueue();
        return;
      }

      // Leaving the foreground is the last chance to write down where each
      // download had got to. Without it the process can be killed with a 40MB
      // track 90% done and the next launch starts that file from zero — which
      // is what "downloads don't resume" means in practice.
      if (state === 'background') {
        void pauseActiveDownloads();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [processDownloadQueue, pauseActiveDownloads]);

  // Coming back onto WiFi — or turning the restriction off — is the other way
  // a held queue becomes runnable, and neither goes through AppState.
  useEffect(() => {
    if (!mayDownloadNow({ wifiOnly, networkType })) return;
    if (jobsRef.current.length > 0) void processDownloadQueue();
  }, [wifiOnly, networkType, processDownloadQueue]);

  const downloadedTracks = useMemo<DownloadedTrack[]>(() => state.tracks.map(track => ({
    trackId: track.trackId,
    localPath: normalizeLocalUri(track.localPath),
    fileSize: track.fileSize,
    downloadedAt: track.downloadedAt,
    albumId: track.albumId,
    artistId: track.artistId,
    serverId: track.serverId,
    serverType: track.serverType,
    coverKind: track.coverKind,
    originalTrack: track.originalTrack,
  })), [state.tracks]);

  const actionsValue = useMemo<DownloadActionsType>(() => ({
    configure: () => {},
    setPlaybackSourcePreference: () => {},
    downloadTrack,
    downloadTracks,
    downloadPlaylist,
    resumeDownload,
    cancelDownload,
    deleteDownloadedTrack,
    downloadAlbumById,
    downloadPlaylistById,
    cancelCollectionDownloads,
    removeDownloadByCollectionId,
    cancelDownloadAll,
    clearDownloadsForProvider,
    clearAllDownloads,
    getLocalPath,
  }), [
    cancelCollectionDownloads,
    cancelDownload,
    cancelDownloadAll,
    clearAllDownloads,
    clearDownloadsForProvider,
    deleteDownloadedTrack,
    downloadAlbumById,
    downloadPlaylist,
    downloadPlaylistById,
    downloadTrack,
    downloadTracks,
    getLocalPath,
    removeDownloadByCollectionId,
    resumeDownload,
  ]);

  const stateValue = useMemo<DownloadStateType>(() => ({
    isTrackDownloaded,
    isTrackDownloading,
    getCollectionDownloadState,
    getAllDownloadedTracks: () => downloadedTracks,
    getAllDownloadedCollections: () => state.collections,
    getStorageInfo: async () => ({
      totalBytes: state.tracks.reduce((sum, track) => sum + track.fileSize, 0),
      downloadedTracks: state.tracks.length,
      availableBytes: await FileSystem.getFreeDiskStorageAsync().catch(() => undefined),
    }),
    getSongLocalUri: async (songId: string) => getLocalPath(songId),
    downloadedTracks,
    downloadStateVersion: downloadedTracks.length,
    totalDownloadedBytes: state.tracks.reduce((sum, track) => sum + track.fileSize, 0),
    downloadedTrackCount: state.tracks.length,
  }), [
    downloadedTracks,
    getCollectionDownloadState,
    getLocalPath,
    isTrackDownloaded,
    isTrackDownloading,
    state.collections,
    state.tracks,
  ]);

  return (
    <DownloadActionsContext.Provider value={actionsValue}>
      <DownloadStateContext.Provider value={stateValue}>
        <DownloadProgressContext.Provider value={downloadProgress}>
          {children}
        </DownloadProgressContext.Provider>
      </DownloadStateContext.Provider>
    </DownloadActionsContext.Provider>
  );
};
