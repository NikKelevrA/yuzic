import { serverProvenance } from '@/domain/identity/Provenance';
import { mapSong } from './mapSong';
import type { PlexMetadata } from './types';

const provenance = serverProvenance('srv-1');

/** A `/library/sections/{id}/all?type=10` response entry. */
const fullDto: PlexMetadata = {
  ratingKey: 100,
  type: 'track',
  title: 'Everything In Its Right Place',
  grandparentRatingKey: 700,
  grandparentTitle: 'Radiohead',
  parentRatingKey: 300,
  parentTitle: 'Kid A',
  thumb: '/library/metadata/100/thumb/1',
  parentThumb: '/library/metadata/300/thumb/1',
  duration: 251_000, // milliseconds
  parentIndex: 1,
  index: 1,
  parentYear: 2000,
  addedAt: 1_709_374_500,
  Genre: [{ tag: 'Electronic' }, { tag: 'Rock' }],
  Guid: [{ id: 'mbid://recording-uuid' }],
  Media: [
    {
      id: 9001,
      duration: 251_000,
      bitrate: 320,
      container: 'mp3',
      Part: [{ id: 1, key: '/library/parts/1/file.mp3', duration: 251_000, container: 'mp3' }],
    },
  ],
};

describe('mapSong', () => {
  it('produces a complete song from a full DTO', () => {
    const song = mapSong(fullDto, { provenance });

    expect(song).toMatchObject({
      localId: 'local:song:srv:srv-1:100',
      nativeId: '100',
      provenance: { origin: 'server', serverId: 'srv-1' },
      title: 'Everything In Its Right Place',
      durationSeconds: 251,
      contentKind: 'song',
      discNumber: 1,
      trackNumber: 1,
      year: 2000,
      genres: ['Electronic', 'Rock'],
    });
    expect(song.audio).toEqual({ bitrateKbps: 320, mimeType: 'audio/mp3' });
  });

  it('converts duration from milliseconds to whole seconds', () => {
    expect(mapSong({ ...fullDto, duration: 4_500 }, { provenance }).durationSeconds).toBe(5);
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapSong(fullDto, { provenance: serverProvenance('srv-2') });
    expect(other.localId).toBe('local:song:srv:srv-2:100');
  });

  it('references its artist and album rather than embedding them', () => {
    const song = mapSong(fullDto, { provenance });
    expect(song.artist).toMatchObject({ localId: 'local:artist:srv:srv-1:700', name: 'Radiohead' });
    expect(song.album).toMatchObject({ localId: 'local:album:srv:srv-1:300', title: 'Kid A' });
  });

  it('captures the recording MBID out of the Guid array', () => {
    expect(mapSong(fullDto, { provenance }).externalIds).toEqual({ mbid: 'recording-uuid' });
  });

  it("carries streamId only because the media part's key differs from the catalog id", () => {
    const song = mapSong(fullDto, { provenance });
    expect(song.nativeId).toBe('100');
    expect(song.streamId).toBe('/library/parts/1/file.mp3');
  });

  it('carries no stream URL, only the identity a stream can be built from', () => {
    expect(mapSong(fullDto, { provenance })).not.toHaveProperty('streamUrl');
  });

  it('produces a valid song from an all-but-empty DTO rather than throwing', () => {
    const song = mapSong({ ratingKey: 1 }, { provenance });

    expect(song).toMatchObject({
      localId: 'local:song:srv:srv-1:1',
      title: 'Unknown',
      durationSeconds: 0,
      contentKind: 'song',
      genres: [],
      externalIds: {},
    });
    expect(song.artist.name).toBe('Unknown Artist');
    expect(song.streamId).toBeUndefined();
    expect(song.cover).toEqual({ kind: 'none' });
  });
});
