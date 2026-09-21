import { serverProvenance } from '@/domain/identity/Provenance';
import { mapSong } from './mapSong';
import type { SubsonicSong } from './types';

const provenance = serverProvenance('srv-1');

/** A getAlbum response entry, with the fields Navidrome actually sends. */
const fullDto: SubsonicSong = {
  id: 'tr-100',
  title: 'Everything In Its Right Place',
  artist: 'Radiohead',
  artistId: 'ar-7',
  album: 'Kid A',
  albumId: 'al-3',
  coverArt: 'al-3',
  duration: 251,
  bitRate: 320,
  samplingRate: 44100,
  bitDepth: 16,
  contentType: 'audio/mpeg',
  year: 2000,
  discNumber: 1,
  track: 1,
  created: '2024-03-02T10:15:00.000Z',
  genres: [{ name: 'Electronic' }, { name: 'Rock' }],
  bpm: 92,
  path: 'Radiohead/Kid A/01 Everything In Its Right Place.mp3',
  musicBrainzId: 'rec-mbid',
  isrc: ['GBAYE0000971', 'GBAYE0000972'],
};

describe('mapSong', () => {
  it('produces a complete song from a full DTO', () => {
    const song = mapSong(fullDto, { provenance });

    expect(song).toMatchObject({
      localId: 'local:song:srv:srv-1:tr-100',
      nativeId: 'tr-100',
      provenance: { origin: 'server', serverId: 'srv-1' },
      title: 'Everything In Its Right Place',
      durationSeconds: 251,
      contentKind: 'song',
      discNumber: 1,
      trackNumber: 1,
      year: 2000,
      genres: ['Electronic', 'Rock'],
    });
    expect(song.bpm).toBe(92);
    expect(song.audio).toEqual({
      bitrateKbps: 320,
      sampleRateHz: 44100,
      bitsPerSample: 16,
      mimeType: 'audio/mpeg',
      // The server's own path for the file, shown in the track info sheet —
      // not a downloaded copy, which lives on a PlayableResource instead.
      path: 'Radiohead/Kid A/01 Everything In Its Right Place.mp3',
    });
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapSong(fullDto, { provenance: serverProvenance('srv-2') });

    expect(other.localId).toBe('local:song:srv:srv-2:tr-100');
    expect(other.localId).not.toBe(mapSong(fullDto, { provenance }).localId);
  });

  it('references its artist and album rather than embedding them', () => {
    const song = mapSong(fullDto, { provenance });

    expect(song.artist).toEqual({
      localId: 'local:artist:srv:srv-1:ar-7',
      nativeId: 'ar-7',
      externalIds: {},
      name: 'Radiohead',
      cover: { kind: 'none', subject: { kind: 'artist', name: 'Radiohead' } },
    });
    expect(song.album.localId).toBe('local:album:srv:srv-1:al-3');
    expect(song.album.title).toBe('Kid A');
  });

  it('captures the ids matching needs, taking the first ISRC', () => {
    expect(mapSong(fullDto, { provenance }).externalIds).toEqual({
      mbid: 'rec-mbid',
      isrc: 'GBAYE0000971',
    });
  });

  it('reads the singular genre field older servers send instead of the list', () => {
    expect(mapSong({ ...fullDto, genres: undefined, genre: 'Jazz' }, { provenance }).genres)
      .toEqual(['Jazz']);
  });

  it('produces a valid song from an all-but-empty DTO rather than throwing', () => {
    const song = mapSong({ id: 'tr-1' }, { provenance });

    expect(song).toMatchObject({
      localId: 'local:song:srv:srv-1:tr-1',
      title: 'Unknown',
      durationSeconds: 0,
      contentKind: 'song',
      genres: [],
      externalIds: {},
    });
    expect(song.artist.name).toBe('Unknown Artist');
    expect(song.cover).toEqual({ kind: 'none' });
  });

  it("names the song's album on a missing cover, so a backup can find it", () => {
    const { coverArt: _omitted, ...withoutArt } = fullDto;
    void _omitted;
    expect(mapSong(withoutArt, { provenance }).cover).toEqual({
      kind: 'none',
      subject: { kind: 'album', title: 'Kid A', artistName: 'Radiohead' },
    });
  });

  it('falls back to the album cover and title when the song carries neither', () => {
    const song = mapSong(
      { id: 'tr-2' },
      { provenance, cover: { kind: 'navidrome', coverArtId: 'al-9' }, albumTitle: 'Amnesiac', albumId: 'al-9' }
    );

    expect(song.cover).toEqual({ kind: 'navidrome', coverArtId: 'al-9' });
    expect(song.album.title).toBe('Amnesiac');
    expect(song.album.nativeId).toBe('al-9');
  });

  it('carries no stream URL, only the identity a stream can be built from', () => {
    expect(mapSong(fullDto, { provenance })).not.toHaveProperty('streamUrl');
  });

  it('carries the rating the user gave it, and tells a missing one from none', () => {
    expect(mapSong({ ...fullDto, userRating: 4 }, { provenance }).userRating).toBe(4);
    // Subsonic omits the field entirely for a track nobody has rated, and
    // sends 0 on some servers. Both are real and they are not the same fact
    // as "this server has no ratings at all", which is what `undefined` says.
    expect(mapSong({ ...fullDto, userRating: 0 }, { provenance }).userRating).toBe(0);
    expect(mapSong(fullDto, { provenance }).userRating).toBeUndefined();
  });
});
