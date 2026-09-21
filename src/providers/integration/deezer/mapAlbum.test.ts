import { integrationProvenance } from '@/domain/identity/Provenance';
import type { LocalId } from '@/domain/identity/LocalId';
import { mapAlbum } from './mapAlbum';
import type { DeezerAlbum } from './types';

const provenance = integrationProvenance('deezer');

/** A `/album/{id}` response, with the fields this adapter actually reads. */
const fullDto: DeezerAlbum = {
  id: 302_127,
  title: 'Discovery',
  artist: { id: 27, name: 'Daft Punk', picture_medium: 'https://api.deezer.com/artist/27/image-medium.jpg' },
  release_date: '2001-03-07',
  record_type: 'album',
  upc: '0724384960650',
  cover_xl: 'https://api.deezer.com/album/302127/cover-xl.jpg',
};

describe('mapAlbum', () => {
  it('produces a complete album from a full DTO', () => {
    expect(mapAlbum(fullDto, { provenance })).toEqual({
      localId: 'local:album:ext:deezer:302127',
      nativeId: '302127',
      provenance: { origin: 'integration', providerId: 'deezer' },
      externalIds: { deezerId: '302127', upc: '0724384960650' },
      title: 'Discovery',
      cover: { kind: 'url', url: 'https://api.deezer.com/album/302127/cover-xl.jpg' },
      artist: {
        localId: 'local:artist:ext:deezer:27',
        nativeId: '27',
        externalIds: { deezerId: '27' },
        name: 'Daft Punk',
        cover: { kind: 'url', url: 'https://api.deezer.com/artist/27/image-medium.jpg' },
      },
      year: 2001,
      releaseDate: '2001-03-07',
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
  });

  it('is external — an album browsed on Deezer is not one the user owns', () => {
  });

  it('maps record_type to the domain release type, including compilations', () => {
    expect(mapAlbum({ ...fullDto, record_type: 'single' }, { provenance }).releaseType).toBe('single');
    expect(mapAlbum({ ...fullDto, record_type: 'ep' }, { provenance }).releaseType).toBe('ep');
    expect(mapAlbum({ ...fullDto, record_type: 'compile' }, { provenance }).releaseType).toBe('compilation');
    expect(mapAlbum({ ...fullDto, record_type: null }, { provenance }).releaseType).toBe('album');
  });

  it('takes its track references from the caller rather than mapping songs itself', () => {
    const songIds = ['local:song:ext:deezer:1', 'local:song:ext:deezer:2'] as LocalId[];

    expect(mapAlbum(fullDto, { provenance, songIds }).songIds).toEqual(songIds);
  });

  it('produces a valid album from an all-but-required-fields-missing DTO rather than throwing', () => {
    const minimal: DeezerAlbum = { id: 5, title: 'Untitled', artist: { id: 9, name: 'Nobody' } };

    expect(mapAlbum(minimal, { provenance })).toEqual({
      localId: 'local:album:ext:deezer:5',
      nativeId: '5',
      provenance: { origin: 'integration', providerId: 'deezer' },
      externalIds: { deezerId: '5' },
      title: 'Untitled',
      cover: { kind: 'none', subject: { kind: 'album', title: 'Untitled', artistName: 'Nobody' } },
      artist: {
        localId: 'local:artist:ext:deezer:9',
        nativeId: '9',
        externalIds: { deezerId: '9' },
        name: 'Nobody',
        cover: { kind: 'none', subject: { kind: 'artist', name: 'Nobody' } },
      },
      year: undefined,
      releaseDate: undefined,
      releaseType: 'album',
      genres: [],
      songIds: [],
    });
  });
});
