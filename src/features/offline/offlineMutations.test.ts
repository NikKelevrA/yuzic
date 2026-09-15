import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import {
  enqueueOfflineMutation,
  OfflineMutation,
} from './offlineMutations'

const provenance = serverProvenance('srv-1');


/** A domain song, as a mapper would build it. */
function makeSong(nativeId: string): Song {
  const ref = (kind: 'artist' | 'album', id: string, label: string) => ({
    localId: makeLocalId(kind, provenance, id),
    nativeId: id,
    externalIds: {},
    cover: { kind: 'none' as const },
    ...(kind === 'artist' ? { name: label } : { title: label }),
  });
  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: nativeId,
    artist: ref('artist', 'a1', 'Artist') as Song['artist'],
    album: ref('album', 'al1', 'Album') as Song['album'],
    cover: { kind: 'none' },
    durationSeconds: 120,
    contentKind: 'song',
    genres: [],
  };
}

const song = makeSong('song-1');

describe('enqueueOfflineMutation', () => {
  it('keeps only the latest favorite operation for a song', () => {
    const first: OfflineMutation = {
      id: '1',
      serverId: 'server',
      type: 'starSong',
      song,
      createdAt: 1,
    }
    const second: OfflineMutation = {
      id: '2',
      serverId: 'server',
      type: 'unstarSong',
      songId: song.localId,
      createdAt: 2,
    }

    expect(enqueueOfflineMutation([first], second)).toEqual([second])
  })

  it('keeps only the latest playlist membership operation for a song', () => {
    const first: OfflineMutation = {
      id: '1',
      serverId: 'server',
      type: 'addSongToPlaylist',
      playlistId: 'playlist',
      song,
      createdAt: 1,
    }
    const second: OfflineMutation = {
      id: '2',
      serverId: 'server',
      type: 'removeSongFromPlaylist',
      playlistId: 'playlist',
      songId: song.localId,
      createdAt: 2,
    }

    expect(enqueueOfflineMutation([first], second)).toEqual([second])
  })

  it('keeps only the latest favorite operation for an album', () => {
    const album = { localId: makeLocalId('album', provenance, 'al1'), nativeId: 'al1' } as unknown as Album;
    const first: OfflineMutation = { id: '1', serverId: 'server', type: 'starAlbum', album, createdAt: 1 };
    const second: OfflineMutation = { id: '2', serverId: 'server', type: 'unstarAlbum', albumId: album.localId, createdAt: 2 };
    const otherAlbum: OfflineMutation = {
      id: '3', serverId: 'server', type: 'unstarAlbum', albumId: makeLocalId('album', provenance, 'al2'), createdAt: 3,
    };

    expect(enqueueOfflineMutation([first, otherAlbum], second)).toEqual([otherAlbum, second]);
  });

  it('does not coalesce operations for different servers', () => {
    const first: OfflineMutation = {
      id: '1',
      serverId: 'server-a',
      type: 'unstarSong',
      songId: song.localId,
      createdAt: 1,
    }
    const second: OfflineMutation = {
      id: '2',
      serverId: 'server-b',
      type: 'starSong',
      song,
      createdAt: 2,
    }

    expect(enqueueOfflineMutation([first], second)).toEqual([first, second])
  })
})
