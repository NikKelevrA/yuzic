import { integrationProvenance } from '@/domain/identity/Provenance';
import type { LocalId } from '@/domain/identity/LocalId';
import { mapAlbum } from './mapAlbum';
import type { MbReleaseGroup } from '.';

const provenance = integrationProvenance('musicbrainz');

/** A `/release-group?query=...` search result, with the fields this adapter actually reads. */
const fullDto: MbReleaseGroup = {
  id: 'e0be0716-0d95-3007-a562-e6e86fdbcc37',
  title: 'Discovery',
  'primary-type': 'Album',
  'first-release-date': '2001-03-07',
  'artist-credit': [
    { name: 'Daft Punk', artist: { id: '056e4f3e-d505-4dad-8ec1-d04f521cbb56', name: 'Daft Punk' } },
  ],
};

describe('mapAlbum', () => {
  it('produces a complete album from a full DTO', () => {
    expect(mapAlbum(fullDto, { provenance })).toEqual({
      localId: 'local:album:ext:musicbrainz:e0be0716-0d95-3007-a562-e6e86fdbcc37',
      nativeId: 'e0be0716-0d95-3007-a562-e6e86fdbcc37',
      provenance: { origin: 'integration', providerId: 'musicbrainz' },
      externalIds: { mbid: 'e0be0716-0d95-3007-a562-e6e86fdbcc37', mbidType: 'release-group' },
      libraryState: 'external',
      title: 'Discovery',
      cover: {
        kind: 'coverartarchive',
        mbid: 'e0be0716-0d95-3007-a562-e6e86fdbcc37',
        mbidType: 'release-group',
      },
      artist: {
        localId: 'local:artist:ext:musicbrainz:056e4f3e-d505-4dad-8ec1-d04f521cbb56',
        nativeId: '056e4f3e-d505-4dad-8ec1-d04f521cbb56',
        externalIds: { mbid: '056e4f3e-d505-4dad-8ec1-d04f521cbb56' },
        name: 'Daft Punk',
        cover: { kind: 'none' },
      },
      year: 2001,
      // 'YYYY-MM-DD' is finer than a year, so it is carried alongside it.
      releaseDate: '2001-03-07',
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
  });

  it('records the id as a release-group MBID, since this adapter never fetches a release on its own', () => {
    expect(mapAlbum(fullDto, { provenance }).externalIds)
      .toEqual({ mbid: 'e0be0716-0d95-3007-a562-e6e86fdbcc37', mbidType: 'release-group' });
  });

  it('is external — a resolved MusicBrainz release-group is not one the user owns', () => {
    expect(mapAlbum(fullDto, { provenance }).libraryState).toBe('external');
  });

  it('maps primary/secondary types to the domain release type, compilation taking precedence', () => {
    expect(mapAlbum({ ...fullDto, 'primary-type': 'Single' }, { provenance }).releaseType).toBe('single');
    expect(mapAlbum({ ...fullDto, 'primary-type': 'EP' }, { provenance }).releaseType).toBe('ep');
    expect(mapAlbum(
      { ...fullDto, 'primary-type': 'Album', 'secondary-types': ['Compilation'] },
      { provenance }
    ).releaseType).toBe('compilation');
  });

  it('omits releaseDate when first-release-date is only a bare year', () => {
    const yearOnly = mapAlbum({ ...fullDto, 'first-release-date': '2001' }, { provenance });
    expect(yearOnly.year).toBe(2001);
    expect(yearOnly.releaseDate).toBeUndefined();
  });

  it('takes its track references from the caller rather than mapping songs itself', () => {
    const songIds = ['local:song:ext:musicbrainz:1', 'local:song:ext:musicbrainz:2'] as LocalId[];

    expect(mapAlbum(fullDto, { provenance, songIds }).songIds).toEqual(songIds);
  });

  it('produces a valid album from an all-but-required-fields-missing DTO rather than throwing', () => {
    const minimal: MbReleaseGroup = { id: 'rg-1', title: 'Untitled' };

    expect(mapAlbum(minimal, { provenance })).toEqual({
      localId: 'local:album:ext:musicbrainz:rg-1',
      nativeId: 'rg-1',
      provenance: { origin: 'integration', providerId: 'musicbrainz' },
      externalIds: { mbid: 'rg-1', mbidType: 'release-group' },
      libraryState: 'external',
      title: 'Untitled',
      cover: { kind: 'coverartarchive', mbid: 'rg-1', mbidType: 'release-group' },
      artist: {
        localId: 'local:artist:ext:musicbrainz:',
        nativeId: '',
        externalIds: {},
        name: 'Unknown Artist',
        cover: { kind: 'none' },
      },
      year: undefined,
      releaseDate: undefined,
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
  });
});
