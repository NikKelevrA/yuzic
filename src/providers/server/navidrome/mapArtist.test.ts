import { serverProvenance } from '@/domain/identity/Provenance';
import { mapArtist } from './mapArtist';

const provenance = serverProvenance('srv-1');

describe('mapArtist', () => {
  it('produces a complete artist from a full DTO', () => {
    expect(mapArtist({ id: 'ar-7', name: 'Radiohead', coverArt: 'ar-7', musicBrainzId: 'ar-mbid' }, provenance))
      .toEqual({
        localId: 'local:artist:srv:srv-1:ar-7',
        nativeId: 'ar-7',
        provenance: { origin: 'server', serverId: 'srv-1' },
        externalIds: { mbid: 'ar-mbid' },
        libraryState: 'in-library',
        name: 'Radiohead',
        cover: { kind: 'navidrome', coverArtId: 'ar-7' },
        tags: [],
        albumIds: [],
      });
  });

  it('derives identity from the provenance it is given', () => {
    expect(mapArtist({ id: 'ar-7' }, serverProvenance('srv-2')).localId)
      .toBe('local:artist:srv:srv-2:ar-7');
  });

  it('omits the MBID rather than recording an empty one, since matching compares on presence', () => {
    expect(mapArtist({ id: 'ar-7', name: 'Radiohead' }, provenance).externalIds).toEqual({});
  });

  it('produces a valid artist from an all-but-empty DTO rather than throwing', () => {
    expect(mapArtist({ id: 'ar-1' }, provenance)).toMatchObject({
      name: 'Unknown Artist',
      cover: { kind: 'none' },
      tags: [],
      albumIds: [],
    });
  });
});
