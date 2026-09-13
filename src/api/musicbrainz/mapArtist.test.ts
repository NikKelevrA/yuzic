import { integrationProvenance } from '@/domain/identity/Provenance';
import { mapArtist } from './mapArtist';
import type { MbArtist } from '.';

const provenance = integrationProvenance('musicbrainz');

/** An `/artist?query=...` search result, with the fields this adapter actually reads. */
const fullDto: MbArtist = {
  id: '056e4f3e-d505-4dad-8ec1-d04f521cbb56',
  name: 'Daft Punk',
  score: 100,
  annotation: 'French electronic music duo formed in 1993.',
};

describe('mapArtist', () => {
  it('produces a complete artist from a full DTO', () => {
    expect(mapArtist(fullDto, provenance)).toEqual({
      localId: 'local:artist:ext:musicbrainz:056e4f3e-d505-4dad-8ec1-d04f521cbb56',
      nativeId: '056e4f3e-d505-4dad-8ec1-d04f521cbb56',
      provenance: { origin: 'integration', providerId: 'musicbrainz' },
      externalIds: { mbid: '056e4f3e-d505-4dad-8ec1-d04f521cbb56' },
      libraryState: 'external',
      name: 'Daft Punk',
      cover: { kind: 'none' },
      biography: 'French electronic music duo formed in 1993.',
      tags: [],
      albumIds: [],
    });
  });

  it('is external — a resolved MusicBrainz artist is not one the user owns', () => {
    expect(mapArtist(fullDto, provenance).libraryState).toBe('external');
  });

  it('captures the MBID as the external id', () => {
    expect(mapArtist(fullDto, provenance).externalIds).toEqual({ mbid: '056e4f3e-d505-4dad-8ec1-d04f521cbb56' });
  });

  it('derives identity from the provenance it is given', () => {
    expect(mapArtist(fullDto, integrationProvenance('musicbrainz')).localId)
      .toBe('local:artist:ext:musicbrainz:056e4f3e-d505-4dad-8ec1-d04f521cbb56');
  });

  it('produces a valid artist from an all-but-required-fields-missing DTO rather than throwing', () => {
    expect(mapArtist({ id: 'ar-1', name: 'Some Artist' }, provenance)).toEqual({
      localId: 'local:artist:ext:musicbrainz:ar-1',
      nativeId: 'ar-1',
      provenance: { origin: 'integration', providerId: 'musicbrainz' },
      externalIds: { mbid: 'ar-1' },
      libraryState: 'external',
      name: 'Some Artist',
      cover: { kind: 'none' },
      biography: undefined,
      tags: [],
      albumIds: [],
    });
  });
});
