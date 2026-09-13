import { integrationProvenance } from '@/domain/identity/Provenance';
import { mapArtist } from './mapArtist';

const provenance = integrationProvenance('deezer');

/** A `/artist/{id}` response, with the fields this adapter actually reads. */
const fullDto = {
  id: 27,
  name: 'Daft Punk',
  nb_album: 12,
  nb_fan: 12_345_678,
  description: 'French electronic duo.',
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
      libraryState: 'external',
      name: 'Daft Punk',
      cover: { kind: 'url', url: 'https://api.deezer.com/artist/27/image-xl.jpg' },
      biography: 'French electronic duo.',
      tags: [],
      albumIds: [],
    });
  });

  it('is external, not in-library — browsing Deezer is not owning it', () => {
    expect(mapArtist(fullDto, provenance).libraryState).toBe('external');
  });

  it('captures the Deezer id as the external id', () => {
    expect(mapArtist(fullDto, provenance).externalIds).toEqual({ deezerId: '27' });
  });

  it('derives identity from the provenance it is given', () => {
    expect(mapArtist(fullDto, integrationProvenance('deezer')).localId)
      .toBe('local:artist:ext:deezer:27');
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
      libraryState: 'external',
      name: 'Solo Artist',
      cover: { kind: 'none' },
      biography: undefined,
      tags: [],
      albumIds: [],
    });
  });
});
