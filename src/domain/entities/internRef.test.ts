import { clearInternedRefs, coverKey, internAlbumRef, internArtistRef } from './internRef';
import type { AlbumRef, ArtistRef } from './EntityRef';
import type { LocalId } from '../identity/LocalId';

const artist = (over: Partial<ArtistRef> = {}): ArtistRef => ({
  localId: 'nd:artist:1' as LocalId,
  nativeId: '1',
  externalIds: {},
  name: 'Boards of Canada',
  cover: { kind: 'navidrome', coverArtId: 'ar-1' },
  ...over,
});

const album = (over: Partial<AlbumRef> = {}): AlbumRef => ({
  localId: 'nd:album:9' as LocalId,
  nativeId: '9',
  externalIds: {},
  title: 'Music Has The Right To Children',
  cover: { kind: 'navidrome', coverArtId: 'al-9' },
  ...over,
});

beforeEach(() => clearInternedRefs());

describe('interning', () => {
  it('hands back the same object for two equal artist references', () => {
    const first = internArtistRef(artist());
    const second = internArtistRef(artist());

    // Identity, not equality: that is the whole point.
    expect(second).toBe(first);
  });

  it('hands back the same object for two equal album references', () => {
    expect(internAlbumRef(album())).toBe(internAlbumRef(album()));
  });

  it('keeps two artists with the same name but different ids apart', () => {
    const a = internArtistRef(artist({ localId: 'nd:artist:1' as LocalId, nativeId: '1' }));
    const b = internArtistRef(artist({ localId: 'nd:artist:2' as LocalId, nativeId: '2' }));

    expect(b).not.toBe(a);
    expect(b.nativeId).toBe('2');
  });

  it('keeps the same artist apart when the cover differs', () => {
    // Art arriving later must not be masked by the earlier coverless copy.
    const without = internArtistRef(artist({ cover: { kind: 'none' } }));
    const with_ = internArtistRef(artist());

    expect(with_).not.toBe(without);
  });

  it('keeps the same artist apart when external ids differ', () => {
    const bare = internArtistRef(artist());
    const withMbid = internArtistRef(artist({ externalIds: { mbid: 'mb-1' } }));

    expect(withMbid).not.toBe(bare);
  });

  it('does not care what order external ids were written in', () => {
    const one = internArtistRef(artist({ externalIds: { mbid: 'm', isrc: 'i' } }));
    const other = internArtistRef(artist({ externalIds: { isrc: 'i', mbid: 'm' } }));

    expect(other).toBe(one);
  });

  it('forgets everything when the catalog is dropped', () => {
    const before = internArtistRef(artist());
    clearInternedRefs();

    expect(internArtistRef(artist())).not.toBe(before);
  });

  it('returns the reference it was given the first time, unchanged', () => {
    const mine = artist();

    expect(internArtistRef(mine)).toBe(mine);
  });
});

describe('coverKey', () => {
  it.each([
    ['ids that differ', { kind: 'navidrome', coverArtId: 'a' }, { kind: 'navidrome', coverArtId: 'b' }],
    ['an optional field that differs', { kind: 'emby', itemId: 'a', tag: 't1' }, { kind: 'emby', itemId: 'a', tag: 't2' }],
    ['different kinds entirely', { kind: 'plex', path: '/a' }, { kind: 'url', url: '/a' }],
  ])('tells two covers apart by %s', (_label, left, right) => {
    expect(coverKey(left as never)).not.toBe(coverKey(right as never));
  });

  it('gives two identical covers the same key', () => {
    expect(coverKey({ kind: 'navidrome', coverArtId: 'x' })).toBe(
      coverKey({ kind: 'navidrome', coverArtId: 'x' })
    );
  });

  it('tells a bare none apart from one carrying a subject', () => {
    expect(coverKey({ kind: 'none' })).not.toBe(
      coverKey({ kind: 'none', subject: { kind: 'artist', name: 'x' } })
    );
  });
});
