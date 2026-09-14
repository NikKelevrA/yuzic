import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import type { SimilarityService } from '@/providers/registry/similarityService';
import type { Song } from '@/domain/entities/Song';
import type { Artist } from '@/domain/entities/Artist';
import type { AlbumDetail } from '@/domain/entities/Detail';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import {
  generateSimilarPlaylistForAlbum,
  generateSimilarPlaylistForArtist,
  generateSimilarPlaylistForSong,
} from './generateSimilarPlaylist';

const mockGetExtension = jest.fn();
jest.mock('@/providers/registry/similarityService', () => ({ useSimilarityService: () => null }));

const provenance = serverProvenance('srv-1');
const similarity: SimilarityService = { similarTrackIds: (...args) => mockGetExtension(...args) };

function song(nativeId: string, title: string): Song {
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
    title,
    artist: ref('artist', 'ar1', 'Some Artist') as Song['artist'],
    album: ref('album', 'al1', 'My Album') as Song['album'],
    cover: { kind: 'none' },
    durationSeconds: 180,
    contentKind: 'song',
    genres: [],
  };
}

const artist: Artist = {
  localId: makeLocalId('artist', provenance, 'ar1'),
  nativeId: 'ar1',
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  name: 'Some Artist',
  cover: { kind: 'none' },
  tags: [],
  albumIds: [],
};

function makeApi(): ApiAdapter {
  return {
    playlists: {
      create: jest.fn(async () => 'p1'),
      addSong: jest.fn(async () => ({ success: true })),
    },
  } as unknown as ApiAdapter;
}

beforeEach(() => {
  mockGetExtension.mockReset();
  mockGetExtension.mockResolvedValue(['t1', 't2']);
});

describe('generateSimilarPlaylistForSong', () => {
  it('seeds the service with the origin id, not on-device identity', async () => {
    await generateSimilarPlaylistForSong(makeApi(), similarity, song('s1', 'Track One'), { size: 25 });

    expect(mockGetExtension).toHaveBeenCalledWith(
      expect.objectContaining({ seedItemIds: ['s1'] })
    );
  });

  it('adds tracks one at a time, so a track the service knows and the library does not is skipped', async () => {
    const api = makeApi();
    (api.playlists.addSong as jest.Mock)
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('not in library'));

    const result = await generateSimilarPlaylistForSong(api, similarity, song('s1', 'Track One'));

    expect(api.playlists.create).toHaveBeenCalledTimes(1);
    // The seed leads its own playlist, followed by the two similar tracks.
    expect(api.playlists.addSong).toHaveBeenCalledTimes(3);
    expect(api.playlists.addSong).toHaveBeenNthCalledWith(1, 'p1', 's1');
    // A rejected add does not abort the rest.
    expect(result.playlistId).toBe('p1');
  });
});

describe('generateSimilarPlaylistForAlbum', () => {
  const album: AlbumDetail = {
    album: {
      localId: makeLocalId('album', provenance, 'al1'),
      nativeId: 'al1',
      provenance,
      externalIds: {},
      libraryState: 'in-library',
      title: 'My Album',
      cover: { kind: 'none' },
      artist: {
        localId: makeLocalId('artist', provenance, 'ar1'),
        nativeId: 'ar1',
        externalIds: {},
        name: 'Some Artist',
        cover: { kind: 'none' },
      },
      releaseType: 'album',
      genres: [],
      songIds: [],
    },
    songs: [song('s1', 'Track One'), song('s2', 'Track Two')],
  };

  it('seeds from the album first track and names the playlist after the album', async () => {
    const api = makeApi();
    await generateSimilarPlaylistForAlbum(api, similarity, album);

    expect(mockGetExtension).toHaveBeenCalledWith(
      expect.objectContaining({ seedItemIds: ['s1'] })
    );
    expect(api.playlists.create).toHaveBeenCalledWith('Similar to My Album');
  });

  it('refuses an album with no tracks rather than creating an empty playlist', async () => {
    await expect(
      generateSimilarPlaylistForAlbum(makeApi(), similarity, { ...album, songs: [] })
    ).rejects.toThrow('no tracks');
  });
});

describe('generateSimilarPlaylistForArtist', () => {
  it('seeds from the supplied tracks and names the playlist after the artist', async () => {
    const api = makeApi();
    await generateSimilarPlaylistForArtist(api, similarity, artist, [song('s9', 'Track Nine')]);

    expect(mockGetExtension).toHaveBeenCalledWith(
      expect.objectContaining({ seedItemIds: ['s9'] })
    );
    expect(api.playlists.create).toHaveBeenCalledWith('Similar to Some Artist');
  });

  it('refuses an artist with no known tracks', async () => {
    await expect(
      generateSimilarPlaylistForArtist(makeApi(), similarity, artist, [])
    ).rejects.toThrow('no tracks');
  });
});
