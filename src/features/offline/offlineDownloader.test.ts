import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { createDownloadProgress } from './downloadProgress';
import { createOfflineDownloader } from './offlineDownloader';
import { createOfflineStore } from './offlineStore';

jest.mock('@/state/mmkvStorage', () => ({ mmkv: { getString: () => undefined, set: () => {} } }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/docs/',
  createDownloadResumable: jest.fn(),
  deleteAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1234 })),
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
}));
jest.mock('./filesystem', () => ({
  DOWNLOAD_DIR: '/docs/downloads/audio/',
  BACKGROUND_FILE_OPTIONS: { sessionType: 0 },
  FOREGROUND_FILE_OPTIONS: { sessionType: 1 },
  buildStagingPath: (track: { localId: string }) => `/docs/downloads/audio/${track.localId}.part`,
  cleanupStagingFiles: jest.fn(async () => {}),
  ensureDownloadDir: jest.fn(async () => {}),
}));

import * as FileSystem from 'expo-file-system/legacy';

const provenance = serverProvenance('srv-1');

const song = (nativeId: string): Song => ({
  localId: makeLocalId('song', provenance, nativeId),
  nativeId,
  provenance,
  externalIds: {},
  title: `Track ${nativeId}`,
  artist: { localId: makeLocalId('artist', provenance, 'a'), nativeId: 'a', externalIds: {}, name: 'A', cover: { kind: 'none' } },
  album: { localId: makeLocalId('album', provenance, 'al'), nativeId: 'al', externalIds: {}, title: 'Al', cover: { kind: 'none' } },
  cover: { kind: 'none' },
  durationSeconds: 100,
  contentKind: 'song',
  genres: [],
});

function memoryStorage() {
  const data = new Map<string, string>();
  return { getString: (key: string) => data.get(key), set: (key: string, value: string) => { data.set(key, value); } };
}

function setup(over: { mayDownload?: boolean } = {}) {
  const store = createOfflineStore({ documentDirectory: '/docs/', storage: memoryStorage() });
  const progress = createDownloadProgress();
  const onJobDropped = jest.fn();
  const downloader = createOfflineDownloader({
    store,
    progress,
    resolveTrack: async track => ({ song: track, streamUrl: `https://server.test/stream/${track.nativeId}` }),
    requestHeaders: () => undefined,
    activeServer: () => ({ id: 'srv-1', type: 'navidrome' }),
    mayDownload: () => over.mayDownload ?? true,
    onJobDropped,
  });
  return { store, downloader, onJobDropped };
}

describe('createOfflineDownloader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('files a finished download under the song localId, into its collection', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: async () => ({ status: 200, headers: { 'content-type': 'audio/flac' } }),
    });
    const { store, downloader } = setup();
    const track = song('42');
    store.updateCollections(() => [{ id: 'al', type: 'album', trackIds: [], downloadedAt: 0 }]);

    await downloader.downloadTrack(track, 'al');

    expect(store.isDownloaded(track.localId)).toBe(true);
    expect(store.isDownloaded('42')).toBe(false);
    expect(store.tracks()[0]).toMatchObject({ trackId: track.localId, serverId: 'srv-1', fileSize: 1234 });
    expect(store.localPath(track.localId)).toMatch(/\.flac$/);
    expect(store.collections()[0].trackIds).toEqual([track.localId]);
    expect(store.isDownloading(track.localId)).toBe(false);
  });

  it('records nothing for a transfer that was cancelled', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({ downloadAsync: async () => undefined });
    const { store, downloader } = setup();

    await downloader.downloadTrack(song('7'));

    expect(store.tracks()).toEqual([]);
  });

  it('holds queued jobs, untouched, while the connection does not allow downloading', async () => {
    const { store, downloader } = setup({ mayDownload: false });

    await downloader.enqueue({ id: 'track:x', type: 'track', tracks: [song('1')] });

    expect(store.jobs().map(job => job.id)).toEqual(['track:x']);
    expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
  });

  it('keeps when a job was first asked for when it is asked for again', async () => {
    const { store, downloader } = setup({ mayDownload: false });
    await downloader.enqueue({ id: 'album:1', type: 'album', collectionId: '1', tracks: [song('1')] });
    const first = store.jobs()[0].createdAt;

    await downloader.enqueue({ id: 'album:1', type: 'album', collectionId: '1', tracks: [song('1'), song('2')] });

    expect(store.jobs()).toHaveLength(1);
    expect(store.jobs()[0].createdAt).toBe(first);
    expect(store.jobs()[0].tracks).toHaveLength(2);
  });

  it('forgets saved transfer state only for tracks no job still wants', async () => {
    const { store, downloader } = setup({ mayDownload: false });
    const wanted = song('1');
    await downloader.enqueue({ id: 'track:1', type: 'track', tracks: [wanted] });
    store.setResumables([
      { trackId: wanted.localId, url: 'u', fileUri: 'f1', resumeData: 'r', savedAt: 1 },
      { trackId: 'orphan', url: 'u', fileUri: 'f2', resumeData: 'r', savedAt: 1 },
    ]);

    await downloader.cancelOrphaned([wanted.localId, 'orphan']);

    expect(store.resumables().map(entry => entry.trackId)).toEqual([wanted.localId]);
  });
});
