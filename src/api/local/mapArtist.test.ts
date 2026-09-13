import { serverProvenance } from '@/domain/identity/Provenance';
import { mapArtist } from './mapArtist';
import type { LocalTrack } from './store';

const provenance = serverProvenance('local');

const track = (overrides: Partial<LocalTrack> = {}): LocalTrack => ({
  id: 'local:1',
  title: 'Weird Fishes',
  artist: 'Radiohead',
  artistId: 'local:artist:radiohead',
  albumId: 'local:album:in-rainbows',
  cover: { kind: 'none' },
  duration: '0',
  streamUrl: 'file:///a.flac',
  localPath: 'file:///a.flac',
  ...overrides,
});

describe('mapArtist', () => {
  it('produces a complete artist from a full track group', () => {
    const tracks = [track(), track({ id: 'local:2', albumId: 'local:album:ok-computer' })];
    const artist = mapArtist({ artistId: 'local:artist:radiohead', tracks }, provenance);

    expect(artist).toMatchObject({
      localId: 'local:artist:srv:local:local:artist:radiohead',
      nativeId: 'local:artist:radiohead',
      provenance: { origin: 'server', serverId: 'local' },
      libraryState: 'in-library',
      name: 'Radiohead',
      tags: [],
    });
    expect(artist.externalIds).toEqual({});
    expect(artist.cover).toEqual({ kind: 'none' });
  });

  it('derives distinct album ids from every distinct albumId among its tracks', () => {
    const tracks = [
      track({ albumId: 'local:album:in-rainbows' }),
      track({ id: 'local:2', albumId: 'local:album:in-rainbows' }),
      track({ id: 'local:3', albumId: 'local:album:ok-computer' }),
    ];
    const artist = mapArtist({ artistId: 'local:artist:radiohead', tracks }, provenance);

    expect(artist.albumIds).toEqual([
      'local:album:srv:local:local:album:in-rainbows',
      'local:album:srv:local:local:album:ok-computer',
    ]);
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const group = { artistId: 'local:artist:radiohead', tracks: [track()] };
    const other = mapArtist(group, serverProvenance('local-2'));
    expect(other.localId).toBe('local:artist:srv:local-2:local:artist:radiohead');
  });

  it('produces a valid artist from a group with no tracks rather than throwing', () => {
    const artist = mapArtist({ artistId: 'local:artist:unknown', tracks: [] }, provenance);

    expect(artist).toMatchObject({
      name: 'Unknown Artist',
      tags: [],
      albumIds: [],
    });
  });
});
