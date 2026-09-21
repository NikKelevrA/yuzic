import type { Artist } from '@/domain/entities/Artist';
import type { Album } from '@/domain/entities/Album';
import type { CoverSource, CoverSubject } from '@/domain/entities/Cover';

/**
 * Backups answering from per-test tables, so these tests are about the rule
 * — own picture, library copy, enabled backups in order — rather than any
 * archive's HTTP.
 */
jest.mock('@/providers/registry/coverBackups', () => ({
  coverBackupFor: (source: string) => mockBackups[source] ?? null,
}));

type MockBackup = {
  source: string;
  handles: (subject: CoverSubject) => boolean;
  lookup: jest.Mock;
};

/* eslint-disable no-var -- hoisted for the jest.mock factory above */
var mockBackups: Record<string, MockBackup> = {};
/* eslint-enable no-var */

type Resolution = typeof import('./coverResolution');

/** A fresh module (and fresh storage) per test: resolution keeps state. */
function load(): { resolution: Resolution; storage: typeof import('@/state/mmkvStorage') } {
  let loaded!: { resolution: Resolution; storage: typeof import('@/state/mmkvStorage') };
  jest.isolateModules(() => {
    loaded = { resolution: require('./coverResolution'), storage: require('@/state/mmkvStorage') };
  });
  return loaded;
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

function backup(source: string, answer: (subject: CoverSubject) => CoverSource | null, handles = () => true): MockBackup {
  return { source, handles, lookup: jest.fn(async (subject: CoverSubject) => answer(subject)) };
}

const url = (u: string): CoverSource => ({ kind: 'url', url: u });
const artistGap = (name: string, mbid?: string): CoverSource =>
  ({ kind: 'none', subject: mbid ? { kind: 'artist', name, mbid } : { kind: 'artist', name } });
const albumGap = (title: string, artistName: string, mbid?: string): CoverSource =>
  ({ kind: 'none', subject: { kind: 'album', title, artistName, ...(mbid ? { mbid, mbidType: 'release' as const } : {}) } });

function libraryArtist(name: string, cover: CoverSource, mbid?: string): Artist {
  return {
    localId: `local:artist:srv:1:${name}` as never,
    nativeId: name,
    provenance: { origin: 'server', serverId: '1' } as never,
    externalIds: mbid ? { mbid } : {},
    name,
    cover,
    tags: [],
    albumIds: [],
  };
}

function libraryAlbum(title: string, artistName: string, cover: CoverSource): Album {
  return {
    localId: `local:album:srv:1:${title}` as never,
    nativeId: title,
    provenance: { origin: 'server', serverId: '1' } as never,
    externalIds: {},
    title,
    cover,
    artist: { localId: 'a' as never, nativeId: 'a', externalIds: {}, name: artistName, cover: { kind: 'none' } },
    releaseType: 'album',
    genres: [],
    songIds: [],
  };
}

beforeEach(() => {
  mockBackups = {};
});

describe('cover resolution', () => {
  it("returns an item's own picture untouched and asks nobody", async () => {
    mockBackups.deezer = backup('deezer', () => url('backup'));
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });

    const own = url('server');
    resolution.requestCoverBackup(own);
    await flush();

    expect(resolution.resolveCoverNow(own)).toEqual({ cover: own, from: 'own' });
    expect(mockBackups.deezer.lookup).not.toHaveBeenCalled();
  });

  it('leaves a gap with no subject alone — there is no one to look up', async () => {
    mockBackups.deezer = backup('deezer', () => url('backup'));
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });

    resolution.requestCoverBackup({ kind: 'none' });
    await flush();

    expect(mockBackups.deezer.lookup).not.toHaveBeenCalled();
  });

  it("uses the library's copy of the same artist before any backup, and asks no backup", async () => {
    mockBackups.deezer = backup('deezer', () => url('backup'));
    const { resolution } = load();
    resolution.setCoverResolutionContext({
      artists: [libraryArtist('Bibio', url('library-bibio'))],
      backups: ['deezer'],
      online: true,
    });

    const gap = artistGap('bibio');
    resolution.requestCoverBackup(gap);
    await flush();

    expect(resolution.resolveCoverNow(gap)).toEqual({ cover: url('library-bibio'), from: 'library' });
    expect(mockBackups.deezer.lookup).not.toHaveBeenCalled();
  });

  it("matches a library album by title and artist, and ignores a library copy that has no picture either", () => {
    const { resolution } = load();
    resolution.setCoverResolutionContext({
      albums: [libraryAlbum('Kid A', 'Radiohead', url('library-kid-a'))],
      artists: [libraryArtist('Bibio', { kind: 'none' })],
    });

    expect(resolution.resolveCoverNow(albumGap('Kid A', 'Radiohead')).from).toBe('library');
    expect(resolution.resolveCoverNow(artistGap('Bibio')).from).toBe('own');
  });

  it('tries enabled backups in order and stops at the first picture', async () => {
    mockBackups.coverartarchive = backup('coverartarchive', () => url('caa'));
    mockBackups.deezer = backup('deezer', () => url('deezer'));
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['coverartarchive', 'deezer'], online: true });
    const heard = jest.fn();
    resolution.subscribeCoverResolution(heard);

    const gap = albumGap('Kid A', 'Radiohead', 'mbid-1');
    resolution.requestCoverBackup(gap);
    await flush();

    expect(resolution.resolveCoverNow(gap)).toEqual({ cover: url('caa'), from: 'coverartarchive' });
    expect(mockBackups.deezer.lookup).not.toHaveBeenCalled();
    expect(heard).toHaveBeenCalled();
  });

  it('moves on to the next backup when one has nothing, and skips one that cannot answer the subject', async () => {
    mockBackups.coverartarchive = backup('coverartarchive', () => url('caa'), () => false);
    mockBackups.deezer = backup('deezer', () => null);
    mockBackups.lrclib = backup('lrclib', () => url('third'));
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['coverartarchive', 'deezer', 'lrclib'], online: true });

    const gap = artistGap('Boards of Canada');
    resolution.requestCoverBackup(gap);
    await flush();

    expect(mockBackups.coverartarchive.lookup).not.toHaveBeenCalled();
    expect(mockBackups.deezer.lookup).toHaveBeenCalledTimes(1);
    expect(resolution.resolveCoverNow(gap)).toEqual({ cover: url('third'), from: 'lrclib' });
  });

  it('remembers answers: a found picture and a definite "none" are not asked again', async () => {
    mockBackups.deezer = backup('deezer', subject => (subject.kind === 'artist' && subject.name === 'Found' ? url('found') : null));
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });

    for (let round = 0; round < 2; round++) {
      resolution.requestCoverBackup(artistGap('Found'));
      resolution.requestCoverBackup(artistGap('Missing'));
      await flush();
    }

    expect(mockBackups.deezer.lookup).toHaveBeenCalledTimes(2);
  });

  it("stops reading a switched-off backup's answer at once, and reads it again when switched back on", async () => {
    mockBackups.deezer = backup('deezer', () => url('deezer'));
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });
    const gap = artistGap('Toggled');
    resolution.requestCoverBackup(gap);
    await flush();

    resolution.setCoverResolutionContext({ backups: [] });
    expect(resolution.resolveCoverNow(gap).from).toBe('own');

    resolution.setCoverResolutionContext({ backups: ['deezer'] });
    resolution.requestCoverBackup(gap);
    await flush();
    expect(resolution.resolveCoverNow(gap)).toEqual({ cover: url('deezer'), from: 'deezer' });
    expect(mockBackups.deezer.lookup).toHaveBeenCalledTimes(1);
  });

  it('asks nobody offline, but still uses what was found while online', async () => {
    mockBackups.deezer = backup('deezer', () => url('deezer'));
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });
    resolution.requestCoverBackup(artistGap('Seen'));
    await flush();

    resolution.setCoverResolutionContext({ online: false });
    resolution.requestCoverBackup(artistGap('Unseen'));
    await flush();

    expect(mockBackups.deezer.lookup).toHaveBeenCalledTimes(1);
    expect(resolution.resolveCoverNow(artistGap('Seen')).from).toBe('deezer');
    expect(resolution.resolveCoverNow(artistGap('Unseen')).from).toBe('own');
  });

  it('does not remember a failed request, and retries it after a pause', async () => {
    let failing = true;
    mockBackups.deezer = backup('deezer', () => {
      if (failing) throw new Error('unreachable');
      return url('deezer');
    });
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });
    const gap = artistGap('Flaky');

    resolution.requestCoverBackup(gap);
    await flush();
    resolution.requestCoverBackup(gap);
    await flush();
    expect(mockBackups.deezer.lookup).toHaveBeenCalledTimes(1);

    failing = false;
    now.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    resolution.requestCoverBackup(gap);
    await flush();

    expect(mockBackups.deezer.lookup).toHaveBeenCalledTimes(2);
    expect(resolution.resolveCoverNow(gap).from).toBe('deezer');
    now.mockRestore();
  });

  it('keeps what it found in storage, keyed by source and subject', async () => {
    mockBackups.deezer = backup('deezer', () => url('deezer'));
    const { resolution, storage } = load();
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });

    resolution.requestCoverBackup(artistGap('Stored', 'mbid-stored'));
    await flush();

    const raw = storage.mmkv.getString('cover-backup:v2:deezer:artist:mbid:mbid-stored');
    expect(raw && JSON.parse(raw).cover).toEqual(url('deezer'));
  });

  it('drops answers kept under the old exact-name rule and asks again', async () => {
    mockBackups.deezer = backup('deezer', () => url('deezer'));
    const { resolution, storage } = load();
    const retired = 'cover-backup:v1:deezer:artist:mbid:mbid-old';
    storage.mmkv.set(retired, JSON.stringify({ cover: null, at: Date.now() }));
    resolution.setCoverResolutionContext({ backups: ['deezer'], online: true });

    resolution.requestCoverBackup(artistGap('Old Miss', 'mbid-old'));
    await flush();

    expect(storage.mmkv.getString(retired)).toBeUndefined();
    expect(mockBackups.deezer.lookup).toHaveBeenCalledTimes(1);
    expect(resolution.resolveCoverNow(artistGap('Old Miss', 'mbid-old')).from).toBe('deezer');
  });

  it('names what it depends on, so a drawing surface knows to ask again', () => {
    const { resolution } = load();
    resolution.setCoverResolutionContext({ backups: ['coverartarchive', 'deezer'], online: true });
    expect(resolution.coverResolutionContextKey()).toBe('online|coverartarchive,deezer');
  });
});
