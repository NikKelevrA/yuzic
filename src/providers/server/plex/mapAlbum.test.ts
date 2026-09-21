import { serverProvenance } from '@/domain/identity/Provenance';
import { mapAlbum } from './mapAlbum';
import type { PlexMetadata } from './types';

const provenance = serverProvenance('srv-1');

/** A `/library/sections/{id}/all?type=9` response entry. */
const fullDto: PlexMetadata = {
  ratingKey: 300,
  type: 'album',
  title: 'Kid A',
  parentRatingKey: 700,
  parentTitle: 'Radiohead',
  thumb: '/library/metadata/300/thumb/1',
  parentThumb: '/library/metadata/700/thumb/1',
  year: 2000,
  Genre: [{ tag: 'Electronic;Rock' }],
  addedAt: 1_709_374_500, // unix seconds
  Guid: [{ id: 'mbid://release-uuid' }],
};

describe('mapAlbum', () => {
  it('produces a complete album from a full DTO', () => {
    const album = mapAlbum(fullDto, { provenance });

    expect(album).toMatchObject({
      localId: 'local:album:srv:srv-1:300',
      nativeId: '300',
      provenance: { origin: 'server', serverId: 'srv-1' },
      title: 'Kid A',
      year: 2000,
      releaseType: 'album',
      genres: ['Electronic', 'Rock'],
      songIds: [],
    });
    expect(album.cover).toEqual({ kind: 'plex', path: '/library/metadata/300/thumb/1' });
  });

  it('converts addedAt from unix seconds to unix ms', () => {
    expect(mapAlbum(fullDto, { provenance }).addedAt).toBe(1_709_374_500_000);
  });

  it('captures the album MBID as a release id, since Plex has no release-group equivalent', () => {
    expect(mapAlbum(fullDto, { provenance }).externalIds).toEqual({
      mbid: 'release-uuid',
      mbidType: 'release',
    });
  });

  it('references its artist rather than embedding it', () => {
    const album = mapAlbum(fullDto, { provenance });
    expect(album.artist).toMatchObject({ localId: 'local:artist:srv:srv-1:700', name: 'Radiohead' });
    expect(album.artist.cover).toEqual({ kind: 'plex', path: '/library/metadata/700/thumb/1' });
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapAlbum(fullDto, { provenance: serverProvenance('srv-2') });
    expect(other.localId).toBe('local:album:srv:srv-2:300');
  });

  it('produces a valid album from an all-but-empty DTO rather than throwing', () => {
    const album = mapAlbum({ ratingKey: 1 }, { provenance });

    expect(album).toMatchObject({
      localId: 'local:album:srv:srv-1:1',
      title: 'Unknown Album',
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
    expect(album.artist.name).toBe('Unknown Artist');
    expect(album.externalIds).toEqual({});
    expect(album.addedAt).toBeUndefined();
    expect(album.cover).toEqual({ kind: 'none' });
  });
});
