import { serverProvenance } from '@/domain/identity/Provenance';
import { JELLYFIN_BRAND, EMBY_BRAND } from './brand';
import { mapArtist } from './mapArtist';
import type { MediaBrowserItem } from './types';

const provenance = serverProvenance('srv-1');

/** A `/Artists` response entry, with the fields both brands actually send. */
const fullDto: MediaBrowserItem = {
  Id: 'ar-7',
  Name: 'Radiohead',
  Type: 'MusicArtist',
  ImageTags: { Primary: 'tag-1' },
  ProviderIds: { MusicBrainz: 'artist-mbid' },
  Overview: 'An English rock band.',
};

describe('mapArtist', () => {
  it('produces a complete artist from a full DTO', () => {
    const artist = mapArtist(fullDto, { provenance, brand: JELLYFIN_BRAND });

    expect(artist).toMatchObject({
      localId: 'local:artist:srv:srv-1:ar-7',
      nativeId: 'ar-7',
      provenance: { origin: 'server', serverId: 'srv-1' },
      libraryState: 'in-library',
      name: 'Radiohead',
      biography: 'An English rock band.',
      tags: [],
      albumIds: [],
    });
    expect(artist.externalIds).toEqual({ mbid: 'artist-mbid' });
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapArtist(fullDto, { provenance: serverProvenance('srv-2'), brand: JELLYFIN_BRAND });

    expect(other.localId).toBe('local:artist:srv:srv-2:ar-7');
    expect(other.localId).not.toBe(mapArtist(fullDto, { provenance, brand: JELLYFIN_BRAND }).localId);
  });

  it('builds a Jellyfin cover from the item id alone', () => {
    const artist = mapArtist(fullDto, { provenance, brand: JELLYFIN_BRAND });
    expect(artist.cover).toEqual({ kind: 'jellyfin', itemId: 'ar-7' });
  });

  it('builds an Emby cover carrying the image tag', () => {
    const artist = mapArtist(fullDto, { provenance, brand: EMBY_BRAND });
    expect(artist.cover).toEqual({ kind: 'emby', itemId: 'ar-7', tag: 'tag-1' });
  });

  it('has no cover on Emby without an image tag, since the image endpoint 404s otherwise', () => {
    const artist = mapArtist({ ...fullDto, ImageTags: undefined }, { provenance, brand: EMBY_BRAND });
    expect(artist.cover).toEqual({ kind: 'none' });
  });

  it('produces a valid artist from an all-but-empty DTO rather than throwing', () => {
    const artist = mapArtist({ Id: 'ar-1' }, { provenance, brand: JELLYFIN_BRAND });

    expect(artist).toMatchObject({
      localId: 'local:artist:srv:srv-1:ar-1',
      name: 'Unknown Artist',
      tags: [],
      albumIds: [],
    });
    expect(artist.externalIds).toEqual({});
    // Jellyfin resolves art from the item id alone, so a cover is still built
    // even with no ImageTags on the DTO.
    expect(artist.cover).toEqual({ kind: 'jellyfin', itemId: 'ar-1' });
    expect(artist.biography).toBeUndefined();
  });
});
