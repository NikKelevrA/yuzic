import { serverProvenance } from '@/domain/identity/Provenance';
import type { LocalId } from '@/domain/identity/LocalId';
import { mapAlbum } from './mapAlbum';
import type { SubsonicAlbum, SubsonicAlbumListEntry } from './types';

const provenance = serverProvenance('srv-1');

/** The ID3 `getAlbum` shape: titled `name`, carries its track list. */
const id3Dto: SubsonicAlbum = {
  id: 'al-3',
  name: 'Kid A',
  artist: 'Radiohead',
  artistId: 'ar-7',
  coverArt: 'al-3',
  year: 2000,
  genre: 'Electronic',
  created: '2024-03-02T10:15:00.000Z',
  musicBrainzId: 'rg-mbid',
};

/** The `getAlbumList` shape: titled `title`, never carries tracks. */
const listDto: SubsonicAlbumListEntry = {
  id: 'al-4',
  title: 'Amnesiac',
  artist: 'Radiohead',
  artistId: 'ar-7',
  coverArt: 'al-4',
  year: 2001,
};

describe('mapAlbum', () => {
  it('produces a complete album from the ID3 shape', () => {
    expect(mapAlbum(id3Dto, { provenance })).toMatchObject({
      localId: 'local:album:srv:srv-1:al-3',
      nativeId: 'al-3',
      provenance: { origin: 'server', serverId: 'srv-1' },
      libraryState: 'in-library',
      title: 'Kid A',
      year: 2000,
      releaseType: 'album',
      genres: ['Electronic'],
      songIds: [],
    });
  });

  it('reads the title out of either endpoint shape', () => {
    expect(mapAlbum(id3Dto, { provenance }).title).toBe('Kid A');
    expect(mapAlbum(listDto, { provenance }).title).toBe('Amnesiac');
  });

  it('records the album MBID as a release group, which is what Navidrome reports', () => {
    expect(mapAlbum(id3Dto, { provenance }).externalIds)
      .toEqual({ mbid: 'rg-mbid', mbidType: 'release-group' });
  });

  it('leaves external ids empty when the server reports none', () => {
    expect(mapAlbum(listDto, { provenance }).externalIds).toEqual({});
  });

  it('references its artist rather than embedding one', () => {
    expect(mapAlbum(id3Dto, { provenance }).artist).toEqual({
      localId: 'local:artist:srv:srv-1:ar-7',
      nativeId: 'ar-7',
      externalIds: {},
      name: 'Radiohead',
      cover: { kind: 'none' },
    });
  });

  it('takes its track references from the caller rather than mapping songs itself', () => {
    const songIds = ['local:song:srv:srv-1:tr-1', 'local:song:srv:srv-1:tr-2'] as LocalId[];

    expect(mapAlbum(id3Dto, { provenance, songIds }).songIds).toEqual(songIds);
  });

  it('produces a valid album from an all-but-empty DTO rather than throwing', () => {
    expect(mapAlbum({ id: 'al-9' }, { provenance })).toMatchObject({
      localId: 'local:album:srv:srv-1:al-9',
      title: 'Unknown Album',
      genres: [],
      songIds: [],
      cover: { kind: 'none' },
    });
  });
});
