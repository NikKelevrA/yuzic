import { matchAlbumToLibrary, matchArtistToLibrary } from '../matchToLibrary';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';

const PROVENANCE = serverProvenance('server-1');

const album = (overrides: Partial<Album> = {}): Album => ({
  localId: makeLocalId('album', PROVENANCE, 'local-album-1'),
  nativeId: 'local-album-1',
  provenance: PROVENANCE,
  externalIds: {},
  libraryState: 'in-library',
  title: 'OK Computer',
  cover: { kind: 'none' },
  artist: {
    localId: makeLocalId('artist', PROVENANCE, 'local-artist-1'),
    nativeId: 'local-artist-1',
    externalIds: {},
    name: 'Radiohead',
    cover: { kind: 'none' },
  },
  releaseType: 'album',
  genres: [],
  songIds: [],
  ...overrides,
});

const artist = (overrides: Partial<Artist> = {}): Artist => ({
  localId: makeLocalId('artist', PROVENANCE, 'local-artist-1'),
  nativeId: 'local-artist-1',
  provenance: PROVENANCE,
  externalIds: {},
  libraryState: 'in-library',
  name: 'Radiohead',
  cover: { kind: 'none' },
  tags: [],
  albumIds: [],
  ...overrides,
});

describe('matchAlbumToLibrary', () => {
  it('matches by externalIds.mbid when both sides have one', () => {
    const local = album({ externalIds: { mbid: 'mbid-abc' } });

    expect(
      matchAlbumToLibrary(
        { externalIds: { mbid: 'mbid-abc' }, title: 'Some Different Title', artistName: 'Someone Else' },
        [local]
      )
    ).toBe(local);
  });

  it('does not match a Deezer numeric id against a local mbid', () => {
    // Regression: the pre-rewrite predicate compared item.id (a Deezer numeric
    // id) directly against a.mbid, which only coincidentally worked for
    // MusicBrainz-sourced items where the native id happens to equal the mbid.
    // `findMatch` only ever compares like identifier fields against each
    // other (mbid vs mbid, deezerId vs deezerId), so this cannot recur.
    const local = album({ externalIds: { mbid: '123456' } });

    expect(
      matchAlbumToLibrary(
        { externalIds: {}, title: 'Totally Different Album', artistName: 'Totally Different Artist' },
        [local]
      )
    ).toBeNull();
  });

  it('falls back to normalized title + artist match when no identifier is available', () => {
    const local = album();

    expect(
      matchAlbumToLibrary({ externalIds: {}, title: '  ok computer ', artistName: 'RADIOHEAD' }, [local])
    ).toBe(local);
  });

  it('returns null when nothing matches', () => {
    expect(
      matchAlbumToLibrary({ externalIds: {}, title: 'Some Album', artistName: 'Some Artist' }, [album()])
    ).toBeNull();
  });

  it('prefers an identifier match over candidate order', () => {
    const decoy = album({ nativeId: 'decoy', title: 'ok computer', artist: { ...album().artist, name: 'radiohead' } });
    const real = album({ nativeId: 'real', externalIds: { mbid: 'mbid-abc' } });

    expect(
      matchAlbumToLibrary(
        { externalIds: { mbid: 'mbid-abc' }, title: 'ok computer', artistName: 'radiohead' },
        [decoy, real]
      )
    ).toBe(real);
  });
});

describe('matchArtistToLibrary', () => {
  it('matches by externalIds.mbid when both sides have one', () => {
    const local = artist({ externalIds: { mbid: 'mbid-xyz' } });

    expect(
      matchArtistToLibrary({ externalIds: { mbid: 'mbid-xyz' }, name: 'Different Name' }, [local])
    ).toBe(local);
  });

  it('falls back to normalized name match when no identifier is available', () => {
    const local = artist();

    expect(matchArtistToLibrary({ externalIds: {}, name: '  RADIOHEAD ' }, [local])).toBe(local);
  });

  it('returns null when nothing matches', () => {
    expect(matchArtistToLibrary({ externalIds: {}, name: 'Someone Else' }, [artist()])).toBeNull();
  });
});
