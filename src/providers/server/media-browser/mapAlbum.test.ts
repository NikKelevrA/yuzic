import { serverProvenance } from '@/domain/identity/Provenance';
import { JELLYFIN_BRAND, EMBY_BRAND } from './brand';
import { mapAlbum } from './mapAlbum';
import type { MediaBrowserItem } from './types';

const provenance = serverProvenance('srv-1');

/** A `/Items?IncludeItemTypes=MusicAlbum` response entry. */
const fullDto: MediaBrowserItem = {
  Id: 'al-3',
  Name: 'Kid A',
  Type: 'MusicAlbum',
  ArtistItems: [{ Id: 'ar-7', Name: 'Radiohead', ProviderIds: { MusicBrainz: 'artist-mbid' } }],
  ImageTags: { Primary: 'tag-1' },
  ProviderIds: { MusicBrainzReleaseGroup: 'rg-mbid', MusicBrainzAlbum: 'release-mbid' },
  ProductionYear: 2000,
  PremiereDate: '2000-10-02T00:00:00.000Z',
  Genres: ['Electronic;Rock'],
  DateCreated: '2024-03-02T10:15:00.000Z',
};

describe('mapAlbum', () => {
  it('produces a complete album from a full DTO', () => {
    const album = mapAlbum(fullDto, { provenance, brand: JELLYFIN_BRAND });

    expect(album).toMatchObject({
      localId: 'local:album:srv:srv-1:al-3',
      nativeId: 'al-3',
      provenance: { origin: 'server', serverId: 'srv-1' },
      title: 'Kid A',
      year: 2000,
      releaseDate: '2000-10-02T00:00:00.000Z',
      releaseType: 'album',
      genres: ['Electronic', 'Rock'],
      songIds: [],
    });
    expect(album.addedAt).toBe(Date.parse('2024-03-02T10:15:00.000Z'));
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapAlbum(fullDto, { provenance: serverProvenance('srv-2'), brand: JELLYFIN_BRAND });
    expect(other.localId).toBe('local:album:srv:srv-2:al-3');
  });

  it('prefers the release-group MBID over the release MBID', () => {
    expect(mapAlbum(fullDto, { provenance, brand: JELLYFIN_BRAND }).externalIds).toEqual({
      mbid: 'rg-mbid',
      mbidType: 'release-group',
    });
  });

  it('falls back to the release MBID typed as a release when no group id is reported', () => {
    const dto = { ...fullDto, ProviderIds: { MusicBrainzAlbum: 'release-mbid' } };
    expect(mapAlbum(dto, { provenance, brand: JELLYFIN_BRAND }).externalIds).toEqual({
      mbid: 'release-mbid',
      mbidType: 'release',
    });
  });

  it('references its artist rather than embedding it', () => {
    const album = mapAlbum(fullDto, { provenance, brand: JELLYFIN_BRAND });
    expect(album.artist.localId).toBe('local:artist:srv:srv-1:ar-7');
    expect(album.artist.name).toBe('Radiohead');
  });

  it('builds an Emby cover carrying the image tag', () => {
    const album = mapAlbum(fullDto, { provenance, brand: EMBY_BRAND });
    expect(album.cover).toEqual({ kind: 'emby', itemId: 'al-3', tag: 'tag-1' });
  });

  it('produces a valid album from an all-but-empty DTO rather than throwing', () => {
    const album = mapAlbum({ Id: 'al-1' }, { provenance, brand: JELLYFIN_BRAND });

    expect(album).toMatchObject({
      localId: 'local:album:srv:srv-1:al-1',
      title: 'Unknown Album',
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
    expect(album.artist.name).toBe('Unknown Artist');
    expect(album.externalIds).toEqual({});
    expect(album.year).toBeUndefined();
    expect(album.addedAt).toBeUndefined();
  });
});
