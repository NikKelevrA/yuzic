import type { EntityCore } from './EntityCore';
import type { ExternalIds } from '../identity/ExternalIds';
import type { LocalId } from '../identity/LocalId';
import type { Provenance } from '../identity/Provenance';
import type { LibraryState } from '../library/LibraryState';
import type { CoverSource } from '@/types/Cover';
import type { ArtistRef, AlbumRef } from './EntityRef';
import type { Artist } from './Artist';
import type { Album } from './Album';
import type { Song } from './Song';
import type { Playlist } from './Playlist';

const localId = (raw: string): LocalId => raw as LocalId;
const provenance: Provenance = { origin: 'server', serverId: 'srv-1' };
const externalIds: ExternalIds = {};
const libraryState: LibraryState = 'in-library';
const cover: CoverSource = { kind: 'none' };

describe('EntityCore required-field contract', () => {
  it('requires localId', () => {
    // @ts-expect-error localId is required
    const missing: EntityCore = { nativeId: 'n1', provenance, externalIds, libraryState };
    expect(missing).toBeDefined();
  });

  it('requires nativeId', () => {
    // @ts-expect-error nativeId is required
    const missing: EntityCore = { localId: localId('1'), provenance, externalIds, libraryState };
    expect(missing).toBeDefined();
  });

  it('requires provenance', () => {
    // @ts-expect-error provenance is required
    const missing: EntityCore = { localId: localId('1'), nativeId: 'n1', externalIds, libraryState };
    expect(missing).toBeDefined();
  });

  it('requires externalIds', () => {
    // @ts-expect-error externalIds is required
    const missing: EntityCore = { localId: localId('1'), nativeId: 'n1', provenance, libraryState };
    expect(missing).toBeDefined();
  });

  it('requires libraryState', () => {
    // @ts-expect-error libraryState is required
    const missing: EntityCore = { localId: localId('1'), nativeId: 'n1', provenance, externalIds };
    expect(missing).toBeDefined();
  });

  it('compiles a complete literal', () => {
    const complete: EntityCore = {
      localId: localId('1'),
      nativeId: 'n1',
      provenance,
      externalIds,
      libraryState,
    };
    expect(complete.nativeId).toBe('n1');
  });
});

describe('Song requires contentKind', () => {
  const artistRef: ArtistRef = {
    localId: localId('artist-1'),
    nativeId: 'a1',
    externalIds,
    name: 'Some Artist',
    cover,
  };
  const albumRef: AlbumRef = {
    localId: localId('album-1'),
    nativeId: 'al1',
    externalIds,
    title: 'Some Album',
    cover,
  };

  it('rejects a Song literal missing contentKind', () => {
    // @ts-expect-error contentKind is required on Song
    const missing: Song = {
      localId: localId('song-1'),
      nativeId: 's1',
      provenance,
      externalIds,
      libraryState,
      title: 'Some Song',
      artist: artistRef,
      album: albumRef,
      cover,
      durationSeconds: 180,
      genres: [],
    };
    expect(missing).toBeDefined();
  });

  it('compiles a complete Song literal', () => {
    const song: Song = {
      localId: localId('song-1'),
      nativeId: 's1',
      provenance,
      externalIds,
      libraryState,
      title: 'Some Song',
      artist: artistRef,
      album: albumRef,
      cover,
      durationSeconds: 180,
      contentKind: 'song',
      genres: [],
    };
    expect(song.contentKind).toBe('song');
  });
});

describe('entity shapes are constructible together', () => {
  it('builds a valid Artist, Album (with ArtistRef), Song (with ArtistRef and AlbumRef), and Playlist', () => {
    const artist: Artist = {
      localId: localId('artist-1'),
      nativeId: 'a1',
      provenance,
      externalIds,
      libraryState,
      name: 'Some Artist',
      cover,
      tags: [],
      albumIds: [],
    };

    const artistRef: ArtistRef = {
      localId: artist.localId,
      nativeId: artist.nativeId,
      externalIds: artist.externalIds,
      name: artist.name,
      cover: artist.cover,
    };

    const album: Album = {
      localId: localId('album-1'),
      nativeId: 'al1',
      provenance,
      externalIds,
      libraryState,
      title: 'Some Album',
      cover,
      artist: artistRef,
      releaseType: 'album',
      genres: [],
      songIds: [],
    };

    const albumRef: AlbumRef = {
      localId: album.localId,
      nativeId: album.nativeId,
      externalIds: album.externalIds,
      title: album.title,
      cover: album.cover,
    };

    const song: Song = {
      localId: localId('song-1'),
      nativeId: 's1',
      provenance,
      externalIds,
      libraryState,
      title: 'Some Song',
      artist: artistRef,
      album: albumRef,
      cover,
      durationSeconds: 180,
      contentKind: 'song',
      genres: [],
    };

    const playlist: Playlist = {
      localId: localId('playlist-1'),
      nativeId: 'p1',
      provenance,
      externalIds,
      libraryState,
      title: 'Some Playlist',
      cover,
      isOwned: true,
      songIds: [song.localId],
    };

    expect(artist.albumIds).toEqual([]);
    expect(album.artist).toBe(artistRef);
    expect(song.artist).toBe(artistRef);
    expect(song.album).toBe(albumRef);
    expect(playlist.songIds).toEqual([song.localId]);
  });
});
