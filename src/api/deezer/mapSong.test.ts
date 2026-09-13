import { isAutoplaySeed, isScrobbleable, hasReissuableUrl } from '@/domain/playback/ContentKind';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { mapPreviewTrack, mapSong } from './mapSong';
import type { DeezerAlbum, DeezerTrack } from './catalog';
import type { DeezerPreviewTrack } from './albums';

const provenance = integrationProvenance('deezer');

const album: DeezerAlbum = {
  id: 302_127,
  title: 'Discovery',
  artist: { id: 27, name: 'Daft Punk' },
  cover_xl: 'https://api.deezer.com/album/302127/cover-xl.jpg',
};

/** An `/artist/{id}/top` or `/album/{id}` track entry. */
const fullTrackDto: DeezerTrack = {
  id: 3_135_556,
  title: 'One More Time',
  duration: 320,
  preview: 'https://cdnt-preview.dzcdn.net/api/1/1/one-more-time.mp3',
  isrc: 'GBDUW0000059',
  artist: { id: 27, name: 'Daft Punk' },
};

describe('mapSong (full catalogue track)', () => {
  it('produces a complete song from a full DTO', () => {
    expect(mapSong(fullTrackDto, { provenance, album })).toEqual({
      localId: 'local:song:ext:deezer:3135556',
      nativeId: '3135556',
      provenance: { origin: 'integration', providerId: 'deezer' },
      externalIds: { deezerId: '3135556', isrc: 'GBDUW0000059' },
      libraryState: 'external',
      title: 'One More Time',
      artist: {
        localId: 'local:artist:ext:deezer:27',
        nativeId: '27',
        externalIds: { deezerId: '27' },
        name: 'Daft Punk',
        cover: { kind: 'none' },
      },
      album: {
        localId: 'local:album:ext:deezer:302127',
        nativeId: '302127',
        externalIds: { deezerId: '302127' },
        title: 'Discovery',
        cover: { kind: 'url', url: 'https://api.deezer.com/album/302127/cover-xl.jpg' },
      },
      cover: { kind: 'url', url: 'https://api.deezer.com/album/302127/cover-xl.jpg' },
      durationSeconds: 320,
      contentKind: 'preview',
      genres: [],
    });
  });

  it('is a preview, because a Deezer track is only ever playable as a 30s clip', () => {
    // The catalogue duration is the work's real length; what Deezer will
    // actually stream is a clip, and contentKind describes the latter.
    const song = mapSong(fullTrackDto, { provenance, album });

    expect(song.contentKind).toBe('preview');
    expect(song.durationSeconds).toBe(320);
    expect(isScrobbleable(song.contentKind)).toBe(false);
    expect(isAutoplaySeed(song.contentKind)).toBe(false);
    expect(hasReissuableUrl(song.contentKind)).toBe(false);
  });

  it('is external — a track browsed on Deezer is not one the user owns', () => {
    expect(mapSong(fullTrackDto, { provenance, album }).libraryState).toBe('external');
  });

  it('derives identity from the provenance it is given', () => {
    expect(mapSong(fullTrackDto, { provenance, album }).localId)
      .toBe('local:song:ext:deezer:3135556');
  });

  it('falls back to the album artist when the track carries none of its own', () => {
    const trackWithoutArtist: DeezerTrack = { id: 1, title: 'Track' };

    expect(mapSong(trackWithoutArtist, { provenance, album }).artist.nativeId).toBe('27');
  });

  it('produces a valid song from an all-but-required-fields-missing DTO rather than throwing', () => {
    const song = mapSong({ id: 1, title: 'Untitled' }, { provenance, album });

    expect(song).toMatchObject({
      localId: 'local:song:ext:deezer:1',
      title: 'Untitled',
      durationSeconds: 0,
      contentKind: 'preview',
      genres: [],
      externalIds: { deezerId: '1' },
    });
  });

  it('carries no stream URL, only the identity a stream can be built from', () => {
    expect(mapSong(fullTrackDto, { provenance, album })).not.toHaveProperty('streamUrl');
  });
});

const previewDto: DeezerPreviewTrack = {
  id: 3_135_556,
  title: 'One More Time',
  track_position: 1,
  preview: 'https://cdnt-preview.dzcdn.net/api/1/1/one-more-time.mp3',
  duration: 30,
};

describe('mapPreviewTrack (30-second clip)', () => {
  it('produces a complete song with contentKind preview', () => {
    expect(mapPreviewTrack(previewDto, { provenance, album })).toEqual({
      localId: 'local:song:ext:deezer:3135556',
      nativeId: '3135556',
      provenance: { origin: 'integration', providerId: 'deezer' },
      externalIds: { deezerId: '3135556' },
      libraryState: 'external',
      title: 'One More Time',
      artist: {
        localId: 'local:artist:ext:deezer:27',
        nativeId: '27',
        externalIds: { deezerId: '27' },
        name: 'Daft Punk',
        cover: { kind: 'none' },
      },
      album: {
        localId: 'local:album:ext:deezer:302127',
        nativeId: '302127',
        externalIds: { deezerId: '302127' },
        title: 'Discovery',
        cover: { kind: 'url', url: 'https://api.deezer.com/album/302127/cover-xl.jpg' },
      },
      cover: { kind: 'url', url: 'https://api.deezer.com/album/302127/cover-xl.jpg' },
      durationSeconds: 30,
      contentKind: 'preview',
      trackNumber: 1,
      genres: [],
    });
  });

  it('is a preview clip, not a full catalogue song', () => {
    expect(mapPreviewTrack(previewDto, { provenance, album }).contentKind).toBe('preview');
  });
});
