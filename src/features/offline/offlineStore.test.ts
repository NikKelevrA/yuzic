import { createOfflineStore } from './offlineStore';
import { DOWNLOAD_SCHEMA_VERSION, type LocalDownloadedTrackEntry } from './restore';

jest.mock('@/state/mmkvStorage', () => ({ mmkv: { getString: () => undefined, set: () => {} } }));

function fakeStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    data,
    getString: (key: string) => data.get(key),
    set: (key: string, value: string) => { data.set(key, value); },
    read: (key: string) => JSON.parse(data.get(key) ?? 'null'),
  };
}

const track = (trackId: string, over: Partial<LocalDownloadedTrackEntry> = {}): LocalDownloadedTrackEntry => ({
  trackId,
  localPath: `/docs/downloads/audio/${trackId}.mp3`,
  fileSize: 100,
  downloadedAt: 0,
  albumId: 'album',
  artistId: 'artist',
  serverId: 'srv',
  serverType: 'navidrome',
  coverKind: 'server',
  schemaVersion: DOWNLOAD_SCHEMA_VERSION,
  ...over,
});

describe('createOfflineStore', () => {
  it('finds a restored track by localId, re-rooted onto this launch and as a file uri', () => {
    const storage = fakeStorage({
      'downloads.tracks.v1': [track('song:srv:1', { localPath: '/old-container/downloads/audio/1.mp3' })],
    });

    const store = createOfflineStore({ documentDirectory: '/docs/', storage });

    expect(store.localPath('song:srv:1')).toBe('file:///docs/downloads/audio/1.mp3');
    expect(store.isDownloaded('song:srv:1')).toBe(true);
    // The re-rooted path is written back, so the next launch starts from it.
    expect(storage.read('downloads.tracks.v1')[0].localPath).toBe('/docs/downloads/audio/1.mp3');
  });

  it('hands out the files of dropped entries once', () => {
    const storage = fakeStorage({
      'downloads.tracks.v1': [track('incomplete', { schemaVersion: 1, serverId: '' })],
    });

    const store = createOfflineStore({ documentDirectory: '/docs/', storage });

    expect(store.takeStalePaths()).toEqual(['/docs/downloads/audio/incomplete.mp3']);
    expect(store.takeStalePaths()).toEqual([]);
  });

  it('persists and publishes a track write, and the lookup follows it', () => {
    const storage = fakeStorage();
    const store = createOfflineStore({ documentDirectory: '/docs/', storage });
    const listener = jest.fn();
    store.subscribe(listener);

    store.updateTracks(() => [track('song:srv:2')]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().tracks.map(entry => entry.trackId)).toEqual(['song:srv:2']);
    expect(store.isDownloaded('song:srv:2')).toBe(true);
    expect(storage.read('downloads.tracks.v1')).toHaveLength(1);

    store.updateTracks(() => []);
    expect(store.localPath('song:srv:2')).toBeNull();
  });

  it('the queue and the screen read the same job list the moment it is written', () => {
    const storage = fakeStorage();
    const store = createOfflineStore({ documentDirectory: '/docs/', storage });

    store.updateJobs(() => [{ id: 'album:1', type: 'album', tracks: [], createdAt: 1, updatedAt: 1 }]);

    expect(store.jobs()).toBe(store.getSnapshot().jobs);
    expect(storage.read('downloads.jobs.v1')).toHaveLength(1);
  });

  it('marks a transfer in flight without persisting it, and only publishes a change', () => {
    const storage = fakeStorage();
    const store = createOfflineStore({ documentDirectory: '/docs/', storage });
    const listener = jest.fn();
    store.subscribe(listener);

    store.setDownloading('song:srv:3', true);
    store.setDownloading('song:srv:3', true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.isDownloading('song:srv:3')).toBe(true);
    expect([...storage.data.keys()]).toEqual([]);
  });

  it('keeps resumables across launches without redrawing anything', () => {
    const storage = fakeStorage();
    const store = createOfflineStore({ documentDirectory: '/docs/', storage });
    const listener = jest.fn();
    store.subscribe(listener);

    store.setResumables([{ trackId: 't', url: 'u', fileUri: 'f', resumeData: 'r', savedAt: 5 }]);

    expect(listener).not.toHaveBeenCalled();
    expect(createOfflineStore({ documentDirectory: '/docs/', storage }).resumables()).toHaveLength(1);
  });
});
