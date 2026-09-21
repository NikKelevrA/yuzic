import { serverProvenance } from '@/domain/identity/Provenance';
import { mapAlbum } from './mapAlbum';
import type { LocalTrack } from './store';

const provenance = serverProvenance('local');

const track = (overrides: Partial<LocalTrack> = {}): LocalTrack => ({
  id: 'local:1',
  title: 'Weird Fishes',
  artist: 'Radiohead',
  artistId: 'local:artist:radiohead',
  albumId: 'local:album:in-rainbows',
  albumTitle: 'In Rainbows',
  cover: { kind: 'none' },
  duration: '0',
  streamId: 'file:///a.flac',
  localPath: 'file:///a.flac',
  year: 2007,
  dateAdded: '2024-05-01T00:00:00.000Z',
  ...overrides,
});

describe('mapAlbum', () => {
  it('produces a complete album from a full track group', () => {
    const album = mapAlbum({ albumId: 'local:album:in-rainbows', tracks: [track()] }, { provenance });

    expect(album).toMatchObject({
      localId: 'local:album:srv:local:local:album:in-rainbows',
      nativeId: 'local:album:in-rainbows',
      provenance: { origin: 'server', serverId: 'local' },
      title: 'In Rainbows',
      year: 2007,
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
    expect(album.externalIds).toEqual({});
    expect(album.addedAt).toBe(Date.parse('2024-05-01T00:00:00.000Z'));
  });

  it('references its artist rather than embedding it', () => {
    const album = mapAlbum({ albumId: 'local:album:in-rainbows', tracks: [track()] }, { provenance });
    expect(album.artist).toMatchObject({ nativeId: 'local:artist:radiohead', name: 'Radiohead' });
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const group = { albumId: 'local:album:in-rainbows', tracks: [track()] };
    const other = mapAlbum(group, { provenance: serverProvenance('local-2') });
    expect(other.localId).toBe('local:album:srv:local-2:local:album:in-rainbows');
  });

  it('produces a valid album from a group with no tracks rather than throwing', () => {
    const album = mapAlbum({ albumId: 'local:album:unknown', tracks: [] }, { provenance });

    expect(album).toMatchObject({
      title: 'Unknown Album',
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
    expect(album.artist.name).toBe('Unknown Artist');
    expect(album.year).toBeUndefined();
    expect(album.addedAt).toBeUndefined();
    expect(album.cover).toEqual({ kind: 'none' });
  });
});
