import { mmkv } from '@/state/mmkvStorage';
import { nextDownloadingIds } from './downloadPolicies';
import type { DownloadedCollectionEntry, PersistedDownloadJob, PersistedResumable } from './downloadStore';
import { normalizeLocalUri, restoreDownloadState, type LocalDownloadedTrackEntry } from './restore';

const KEYS = {
  tracks: 'downloads.tracks.v1',
  collections: 'downloads.collections.v1',
  jobs: 'downloads.jobs.v1',
  resumables: 'downloads.resumables.v1',
} as const;

type KeyValueStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

type OfflineSnapshot = {
  tracks: LocalDownloadedTrackEntry[];
  collections: DownloadedCollectionEntry[];
  jobs: PersistedDownloadJob[];
  /** Tracks transferring right now. Not persisted: a fresh launch has none. */
  downloading: Set<string>;
};

export type OfflineStore = ReturnType<typeof createOfflineStore>;

function readArray<T>(storage: KeyValueStorage, key: string): T[] {
  const raw = storage.getString(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const indexLocalPaths = (tracks: LocalDownloadedTrackEntry[]) =>
  new Map(tracks.map(track => [track.trackId, normalizeLocalUri(track.localPath)]));

/**
 * The one owner of what this device holds offline: downloaded tracks, saved
 * collections, queued jobs, and the state of transfers interrupted part-way.
 *
 * It replaces a raw-key module plus a React state copy of the same records,
 * where the job list in particular was kept twice — once for the queue, which
 * must see an edit between awaits, and once for the screen. Every write here
 * persists and publishes in one call, and both readers see the same value.
 *
 * Tracks are keyed by the song's `localId` throughout — the index, the queue,
 * resumables, and the engine's own media id — because two servers can each
 * call a track `42`. Collections are keyed by the album or playlist id their
 * download was started with.
 */
export function createOfflineStore({
  documentDirectory,
  storage = mmkv,
}: {
  /** Where the app's documents live this launch, to re-root stored paths onto. */
  documentDirectory: string | null;
  storage?: KeyValueStorage;
}) {
  const write = (key: string, value: unknown[]) => storage.set(key, JSON.stringify(value));

  const restored = restoreDownloadState({
    tracks: readArray(storage, KEYS.tracks),
    collections: readArray(storage, KEYS.collections),
    jobs: readArray(storage, KEYS.jobs),
  }, documentDirectory);
  if (restored.changed) {
    write(KEYS.tracks, restored.tracks);
    write(KEYS.collections, restored.collections);
  }

  let stalePaths = restored.stalePaths;
  let resumables = readArray<PersistedResumable>(storage, KEYS.resumables);
  let localPaths = indexLocalPaths(restored.tracks);
  let snapshot: OfflineSnapshot = {
    tracks: restored.tracks,
    collections: restored.collections,
    jobs: restored.jobs,
    downloading: new Set(),
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<OfflineSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: (): OfflineSnapshot => snapshot,

    tracks: () => snapshot.tracks,
    collections: () => snapshot.collections,
    jobs: () => snapshot.jobs,
    /** The playable file for a track, by `localId`. */
    localPath: (trackId: string): string | null => localPaths.get(trackId) ?? null,
    isDownloaded: (trackId: string): boolean => localPaths.has(trackId),
    isDownloading: (trackId: string): boolean => snapshot.downloading.has(trackId),

    updateTracks(updater: (tracks: LocalDownloadedTrackEntry[]) => LocalDownloadedTrackEntry[]) {
      const tracks = updater(snapshot.tracks);
      write(KEYS.tracks, tracks);
      localPaths = indexLocalPaths(tracks);
      publish({ tracks });
    },
    updateCollections(updater: (collections: DownloadedCollectionEntry[]) => DownloadedCollectionEntry[]) {
      const collections = updater(snapshot.collections);
      write(KEYS.collections, collections);
      publish({ collections });
    },
    updateJobs(updater: (jobs: PersistedDownloadJob[]) => PersistedDownloadJob[]) {
      const jobs = updater(snapshot.jobs);
      write(KEYS.jobs, jobs);
      publish({ jobs });
    },
    setDownloading(trackId: string, downloading: boolean) {
      if (snapshot.downloading.has(trackId) === downloading) return;
      publish({ downloading: nextDownloadingIds(snapshot.downloading, trackId, downloading) });
    },

    /** Saved transfer state. Nothing draws it, so writing it publishes nothing. */
    resumables: (): PersistedResumable[] => resumables,
    setResumables(next: PersistedResumable[]) {
      resumables = next;
      write(KEYS.resumables, next);
    },

    /** Files of entries the restore dropped, handed out once for deletion. */
    takeStalePaths(): string[] {
      const paths = stalePaths;
      stalePaths = [];
      return paths;
    },
  };
}
