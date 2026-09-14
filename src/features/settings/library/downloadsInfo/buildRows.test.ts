import type { TFunction } from 'i18next';
import { buildDownloadRows } from './buildRows';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import type { Playlist } from '@/domain/entities/Playlist';
import type { DownloadedTrack } from '@/features/offline/DownloadContext';

const t = ((key: string) => {
  const labels: Record<string, string> = {
    'settings.library.downloads.type.album': 'Album',
    'settings.library.downloads.type.playlist': 'Playlist',
    'settings.library.downloads.type.track': 'Track',
    'settings.library.downloads.unknownTrack': 'Unknown Track',
  };
  return labels[key] ?? key;
}) as TFunction;

const cover = { kind: 'none' as const };
const PROVENANCE = serverProvenance('server-1');

function album(nativeId: string, overrides: Partial<Album> = {}): Album {
  return {
    localId: makeLocalId('album', PROVENANCE, nativeId),
    nativeId,
    provenance: PROVENANCE,
    externalIds: {},
    libraryState: 'in-library',
    title: `Album ${nativeId}`,
    cover,
    artist: {
      localId: makeLocalId('artist', PROVENANCE, 'artist-1'),
      nativeId: 'artist-1',
      externalIds: {},
      name: 'Some Artist',
      cover,
    },
    releaseType: 'album',
    genres: [],
    songIds: [],
    ...overrides,
  };
}

function playlist(nativeId: string, overrides: Partial<Playlist> = {}): Playlist {
  return {
    localId: makeLocalId('playlist', PROVENANCE, nativeId),
    nativeId,
    provenance: PROVENANCE,
    externalIds: {},
    libraryState: 'in-library',
    title: `Playlist ${nativeId}`,
    cover,
    isOwned: true,
    songIds: [],
    ...overrides,
  };
}

function song(nativeId: string, albumNativeId: string | null, overrides: Partial<Song> = {}): Song {
  return {
    localId: makeLocalId('song', PROVENANCE, nativeId),
    nativeId,
    provenance: PROVENANCE,
    externalIds: {},
    libraryState: 'in-library',
    title: `Track ${nativeId}`,
    artist: {
      localId: makeLocalId('artist', PROVENANCE, 'artist-1'),
      nativeId: 'artist-1',
      externalIds: {},
      name: 'Some Artist',
      cover,
    },
    album: {
      localId: albumNativeId ? makeLocalId('album', PROVENANCE, albumNativeId) : makeLocalId('album', PROVENANCE, ''),
      nativeId: albumNativeId ?? '',
      externalIds: {},
      title: '',
      cover,
    },
    cover,
    durationSeconds: 0,
    contentKind: 'song',
    genres: [],
    ...overrides,
  };
}

// The persisted download record keys tracks/albums by `localId` (see
// DownloadContext's `performDownloadTrack`), so these fixtures build the
// downloaded-entry ids from the same album/track fixtures' `localId`.
const albumOne = album('album-1');
const trackA1 = song('a1', 'album-1');
const trackA2 = song('a2', 'album-1');
const playlistOne = playlist('playlist-1');
const trackP1 = song('p1', null);

describe('buildDownloadRows', () => {
  it('builds album and playlist rows from downloaded collections', () => {
    const rows = buildDownloadRows({
      albums: [albumOne],
      playlists: [playlistOne],
      tracks: [trackA1, trackA2],
      downloadedTracks: [
        {
          trackId: trackA1.localId,
          fileSize: 1024,
          downloadedAt: 1700000000000,
          localPath: '/tmp/fake.mp3',
          albumId: albumOne.localId,
          artistId: 'artist-1',
          serverId: 'server-1',
          serverType: 'navidrome',
          coverKind: 'navidrome',
        },
        {
          trackId: trackA2.localId,
          fileSize: 2048,
          downloadedAt: 1700000000000,
          localPath: '/tmp/fake.mp3',
          albumId: albumOne.localId,
          artistId: 'artist-1',
          serverId: 'server-1',
          serverType: 'navidrome',
          coverKind: 'navidrome',
        },
        {
          trackId: trackP1.localId,
          albumId: '',
          artistId: 'artist-1',
          fileSize: 4096,
          downloadedAt: 1700000000000,
          localPath: '/tmp/fake.mp3',
          serverId: 'server-1',
          serverType: 'navidrome',
          coverKind: 'navidrome',
        },
      ] as DownloadedTrack[],
      downloadedCollections: [
        { id: albumOne.nativeId, type: 'album', trackIds: [trackA1.localId, trackA2.localId], downloadedAt: 1700000000000 },
        { id: playlistOne.nativeId, type: 'playlist', trackIds: [trackP1.localId], downloadedAt: 1700000001000 },
      ],
      t,
    });

    expect(rows.map(row => ({
      collectionId: row.collectionId,
      type: row.type,
      provider: row.provider,
      trackIds: row.trackIds,
      size: row.size,
      trackCount: row.trackCount,
    }))).toEqual([
      {
        collectionId: playlistOne.nativeId,
        type: 'playlist',
        provider: 'navidrome',
        trackIds: [trackP1.localId],
        size: '4.00 KB',
        trackCount: 1,
      },
      {
        collectionId: albumOne.nativeId,
        type: 'album',
        provider: 'navidrome',
        trackIds: [trackA1.localId, trackA2.localId],
        size: '3.00 KB',
        trackCount: 2,
      },
    ]);
  });

  it('falls back to persisted playlist track ids when playlist songs are not loaded', () => {
    const rows = buildDownloadRows({
      albums: [],
      playlists: [playlistOne],
      tracks: [],
      downloadedTracks: [
        {
          trackId: trackP1.localId,
          albumId: '',
          artistId: 'artist-1',
          fileSize: 1024,
          downloadedAt: 1700000000000,
          localPath: '/tmp/fake.mp3',
          serverId: 'server-1',
          serverType: 'jellyfin',
          coverKind: 'jellyfin',
        },
      ] as DownloadedTrack[],
      downloadedCollections: [
        { id: playlistOne.nativeId, type: 'playlist', trackIds: [trackP1.localId, 'missing'], downloadedAt: 1700000000000 },
      ],
      t,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      collectionId: playlistOne.nativeId,
      provider: 'jellyfin',
      trackIds: [trackP1.localId],
      trackCount: 1,
    });
  });

  it('surfaces tracks downloaded individually as their own rows', () => {
    const solo = song('solo-1', null, { title: 'Solo Track' });
    const rows = buildDownloadRows({
      albums: [],
      playlists: [],
      tracks: [solo],
      downloadedTracks: [
        {
          trackId: solo.localId,
          albumId: '',
          artistId: 'artist-1',
          fileSize: 512,
          downloadedAt: 1700000000000,
          localPath: '/tmp/fake.mp3',
          serverId: 'server-1',
          serverType: 'navidrome',
          coverKind: 'navidrome',
        },
        {
          trackId: makeLocalId('song', PROVENANCE, 'solo-untitled'),
          albumId: '',
          artistId: 'artist-1',
          fileSize: 256,
          downloadedAt: 1700000000000,
          localPath: '/tmp/fake.mp3',
          serverId: 'server-1',
          serverType: 'navidrome',
          coverKind: 'navidrome',
        },
      ] as DownloadedTrack[],
      downloadedCollections: [],
      t,
    });

    expect(rows).toHaveLength(2);
    expect(rows.map(row => ({
      collectionId: row.collectionId,
      type: row.type,
      title: row.title,
      trackIds: row.trackIds,
      trackCount: row.trackCount,
    }))).toEqual(expect.arrayContaining([
      { collectionId: solo.localId, type: 'track', title: 'Solo Track', trackIds: [solo.localId], trackCount: 1 },
      { collectionId: makeLocalId('song', PROVENANCE, 'solo-untitled'), type: 'track', title: 'Unknown Track', trackIds: [makeLocalId('song', PROVENANCE, 'solo-untitled')], trackCount: 1 },
    ]));
  });

  it('does not duplicate a track that is both standalone-downloaded and part of a collection', () => {
    const rows = buildDownloadRows({
      albums: [albumOne],
      playlists: [],
      tracks: [trackA1],
      downloadedTracks: [
        {
          trackId: trackA1.localId,
          fileSize: 1024,
          downloadedAt: 1700000000000,
          localPath: '/tmp/fake.mp3',
          albumId: albumOne.localId,
          artistId: 'artist-1',
          serverId: 'server-1',
          serverType: 'navidrome',
          coverKind: 'navidrome',
        },
      ] as DownloadedTrack[],
      downloadedCollections: [
        { id: albumOne.nativeId, type: 'album', trackIds: [trackA1.localId], downloadedAt: 1700000000000 },
      ],
      t,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('album');
  });

  it('ignores library items that do not have a downloaded collection entry', () => {
    const rows = buildDownloadRows({
      albums: [albumOne],
      playlists: [playlistOne],
      tracks: [],
      downloadedTracks: [],
      downloadedCollections: [],
      t,
    });

    expect(rows).toEqual([]);
  });
});
