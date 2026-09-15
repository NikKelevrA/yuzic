import {
  albumCoverSubject,
  artistCoverSubject,
  coverOrMissing,
  coverSubjectKey,
  missingCover,
} from './Cover';

describe('cover subjects', () => {
  it('names an artist, with its MusicBrainz id where known, and nobody for a blank name', () => {
    expect(artistCoverSubject('Bibio')).toEqual({ kind: 'artist', name: 'Bibio' });
    expect(artistCoverSubject('Bibio', { mbid: 'm' })).toEqual({ kind: 'artist', name: 'Bibio', mbid: 'm' });
    expect(artistCoverSubject('  ')).toBeUndefined();
    expect(artistCoverSubject(undefined)).toBeUndefined();
  });

  it('needs both a title and an artist to name an album, and keeps an id kind only with its id', () => {
    expect(albumCoverSubject('Kid A', undefined)).toBeUndefined();
    expect(albumCoverSubject(undefined, 'Radiohead')).toBeUndefined();
    expect(albumCoverSubject('Kid A', 'Radiohead', { mbidType: 'release' })).toEqual({
      kind: 'album', title: 'Kid A', artistName: 'Radiohead',
    });
    expect(albumCoverSubject('Kid A', 'Radiohead', { mbid: 'm', mbidType: 'release-group' })).toEqual({
      kind: 'album', title: 'Kid A', artistName: 'Radiohead', mbid: 'm', mbidType: 'release-group',
    });
  });

  it('names the lead artist of a credit line, from whichever source it came', () => {
    expect(artistCoverSubject('Drake feat. Rihanna', { mbid: 'm' })).toEqual({ kind: 'artist', name: 'Drake', mbid: 'm' });
    expect(albumCoverSubject('Begin Again', 'Ben Böhmer feat. lau.ra')).toEqual({
      kind: 'album', title: 'Begin Again', artistName: 'Ben Böhmer',
    });
  });

  it("keeps a source's own picture and only names a gap", () => {
    const subject = artistCoverSubject('Bibio');
    expect(coverOrMissing({ kind: 'url', url: 'x' }, subject)).toEqual({ kind: 'url', url: 'x' });
    expect(coverOrMissing({ kind: 'none' }, subject)).toEqual({ kind: 'none', subject });
    expect(missingCover(undefined)).toEqual({ kind: 'none' });
  });

  it('keys a subject by MusicBrainz id when it has one, else by normalised name', () => {
    expect(coverSubjectKey({ kind: 'artist', name: 'Bibio', mbid: 'm' })).toBe('artist:mbid:m');
    expect(coverSubjectKey({ kind: 'artist', name: '  BIBIO ' })).toBe(coverSubjectKey({ kind: 'artist', name: 'bibio' }));
    expect(coverSubjectKey({ kind: 'album', title: 'Kid  A', artistName: 'Radiohead' })).toBe('album:name:radiohead:kid a');
  });
});
