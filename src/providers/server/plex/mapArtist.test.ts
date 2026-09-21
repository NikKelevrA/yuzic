import { serverProvenance } from '@/domain/identity/Provenance';
import { mapArtist } from './mapArtist';
import type { PlexMetadata } from './types';

const provenance = serverProvenance('srv-1');

/** A `/library/sections/{id}/all?type=8` response entry. */
const fullDto: PlexMetadata = {
  ratingKey: 700,
  type: 'artist',
  title: 'Radiohead',
  thumb: '/library/metadata/700/thumb/123',
  summary: 'An English rock band.',
  Guid: [{ id: 'plex://artist/abc' }, { id: 'mbid://a74b1b7f-71a5-4011-9441-d0b5e4122711' }],
};

describe('mapArtist', () => {
  it('produces a complete artist from a full DTO', () => {
    const artist = mapArtist(fullDto, provenance);

    expect(artist).toMatchObject({
      localId: 'local:artist:srv:srv-1:700',
      nativeId: '700',
      provenance: { origin: 'server', serverId: 'srv-1' },
      name: 'Radiohead',
      biography: 'An English rock band.',
      tags: [],
      albumIds: [],
    });
    expect(artist.cover).toEqual({ kind: 'plex', path: '/library/metadata/700/thumb/123' });
  });

  it('picks the mbid:// entry out of the Guid array, ignoring other schemes', () => {
    expect(mapArtist(fullDto, provenance).externalIds).toEqual({
      mbid: 'a74b1b7f-71a5-4011-9441-d0b5e4122711',
    });
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapArtist(fullDto, serverProvenance('srv-2'));
    expect(other.localId).toBe('local:artist:srv:srv-2:700');
  });

  it('produces a valid artist from an all-but-empty DTO rather than throwing', () => {
    const artist = mapArtist({ ratingKey: 1 }, provenance);

    expect(artist).toMatchObject({
      localId: 'local:artist:srv:srv-1:1',
      name: 'Unknown Artist',
      tags: [],
      albumIds: [],
    });
    expect(artist.cover).toEqual({ kind: 'none' });
    expect(artist.externalIds).toEqual({});
    expect(artist.biography).toBeUndefined();
  });
});
