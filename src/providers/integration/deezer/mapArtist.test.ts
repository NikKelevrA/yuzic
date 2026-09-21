import { integrationProvenance } from '@/domain/identity/Provenance';
import { mapArtist } from './mapArtist';

const provenance = integrationProvenance('deezer');

/** A `/artist/{id}` response, with the fields this adapter actually reads. */
const fullDto = {
  id: 27,
  name: 'Daft Punk',
  nb_album: 12,
  nb_fan: 12_345_678,
  picture_xl: 'https://api.deezer.com/artist/27/image-xl.jpg',
  picture_big: 'https://api.deezer.com/artist/27/image-big.jpg',
};

describe('mapArtist', () => {
  it('produces a complete artist from a full DTO', () => {
    expect(mapArtist(fullDto, provenance)).toEqual({
      localId: 'local:artist:ext:deezer:27',
      nativeId: '27',
      provenance: { origin: 'integration', providerId: 'deezer' },
      externalIds: { deezerId: '27' },
      name: 'Daft Punk',
      cover: { kind: 'url', url: 'https://api.deezer.com/artist/27/image-xl.jpg' },
      tags: [],
      albumIds: [],
    });
  });

  it('is external, not in-library — browsing Deezer is not owning it', () => {
  });

  it('captures the Deezer id as the external id', () => {
    expect(mapArtist(fullDto, provenance).externalIds).toEqual({ deezerId: '27' });
  });

  it('derives identity from the provenance it is given', () => {
    expect(mapArtist(fullDto, integrationProvenance('deezer')).localId)
      .toBe('local:artist:ext:deezer:27');
  });

  it("reads Deezer's empty-hash silhouette as no picture, naming the artist", () => {
    expect(mapArtist({ id: 2, name: 'Faceless', picture_xl: 'https://e-cdns-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg' }, provenance).cover)
      .toEqual({ kind: 'none', subject: { kind: 'artist', name: 'Faceless' } });
  });

  it('prefers the largest picture available, falling back down the list', () => {
    expect(mapArtist({ ...fullDto, picture_xl: null }, provenance).cover)
      .toEqual({ kind: 'url', url: 'https://api.deezer.com/artist/27/image-big.jpg' });
  });

  it('produces a valid artist from an all-but-required-fields-missing DTO rather than throwing', () => {
    expect(mapArtist({ id: 1, name: 'Solo Artist' }, provenance)).toEqual({
      localId: 'local:artist:ext:deezer:1',
      nativeId: '1',
      provenance: { origin: 'integration', providerId: 'deezer' },
      externalIds: { deezerId: '1' },
      name: 'Solo Artist',
      cover: { kind: 'none', subject: { kind: 'artist', name: 'Solo Artist' } },
      tags: [],
      albumIds: [],
    });
  });
});
