import { findMatch, leadArtistName, normalizeName, sharedIdentifier } from './matching';
import type { Matchable, NameKey } from './matching';
import type { ExternalIds } from './ExternalIds';
import type { LocalId } from './LocalId';

const localId = (raw: string): LocalId => raw as LocalId;

interface Album extends Matchable {
  title: string;
  artist: string;
}

const album = (
  id: string,
  title: string,
  artist: string,
  externalIds: ExternalIds = {}
): Album => ({
  localId: localId(id),
  externalIds,
  title,
  artist,
});

const nameKeyOf = (a: Album): NameKey => ({ primary: a.title, secondary: a.artist });

describe('sharedIdentifier', () => {
  it('finds an mbid match when both sides agree', () => {
    expect(sharedIdentifier({ mbid: 'm1' }, { mbid: 'm1' })).toBe('mbid');
  });

  it('returns null when no identifier is shared', () => {
    expect(sharedIdentifier({ mbid: 'm1' }, { mbid: 'm2' })).toBeNull();
    expect(sharedIdentifier({}, {})).toBeNull();
  });

  it('refuses an mbid match when mbidType differs on both sides', () => {
    expect(
      sharedIdentifier(
        { mbid: 'm1', mbidType: 'release' },
        { mbid: 'm1', mbidType: 'release-group' }
      )
    ).toBeNull();
  });

  it('allows an mbid match when one side omits mbidType', () => {
    expect(
      sharedIdentifier({ mbid: 'm1', mbidType: 'release' }, { mbid: 'm1' })
    ).toBe('mbid');
    expect(
      sharedIdentifier({ mbid: 'm1' }, { mbid: 'm1', mbidType: 'release-group' })
    ).toBe('mbid');
  });

  it('allows an mbid match when both sides omit mbidType', () => {
    expect(sharedIdentifier({ mbid: 'm1' }, { mbid: 'm1' })).toBe('mbid');
  });

  it('allows an mbid match when both sides agree on mbidType', () => {
    expect(
      sharedIdentifier(
        { mbid: 'm1', mbidType: 'release' },
        { mbid: 'm1', mbidType: 'release' }
      )
    ).toBe('mbid');
  });

  it('finds the strongest shared identifier when several match', () => {
    expect(
      sharedIdentifier(
        { mbid: 'm1', isrc: 'i1', deezerId: 'd1' },
        { mbid: 'm1', isrc: 'i1', deezerId: 'd1' }
      )
    ).toBe('mbid');
  });

  it('falls back to a weaker identifier when the stronger ones do not match', () => {
    expect(
      sharedIdentifier({ mbid: 'm1', deezerId: 'd1' }, { mbid: 'm2', deezerId: 'd1' })
    ).toBe('deezerId');
  });
});

describe('normalizeName', () => {
  it('lowercases', () => {
    expect(normalizeName('Song Title')).toBe('song title');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeName('  Song Title  ')).toBe('song title');
  });

  it('collapses internal whitespace runs', () => {
    expect(normalizeName('Song   Title')).toBe('song title');
  });

  it('does not strip parenthesised suffixes', () => {
    expect(normalizeName('Song')).not.toBe(normalizeName('Song (Live)'));
  });
});

describe('leadArtistName', () => {
  it('drops featured artists however the credit marks them', () => {
    expect(leadArtistName('Ben Böhmer feat. lau.ra')).toBe('Ben Böhmer');
    expect(leadArtistName('Drake ft. Rihanna')).toBe('Drake');
    expect(leadArtistName('Calvin Harris featuring Ellie Goulding')).toBe('Calvin Harris');
    expect(leadArtistName('Kanye West (feat. Jay-Z)')).toBe('Kanye West');
    expect(leadArtistName('Kanye West [Feat. Jay-Z]')).toBe('Kanye West');
  });

  it('leaves names that only look like joins alone', () => {
    expect(leadArtistName('Simon & Garfunkel')).toBe('Simon & Garfunkel');
    expect(leadArtistName('Lil Baby & Gunna')).toBe('Lil Baby & Gunna');
    expect(leadArtistName('Earth, Wind & Fire')).toBe('Earth, Wind & Fire');
    expect(leadArtistName('Little Feat')).toBe('Little Feat');
    expect(leadArtistName('Loft')).toBe('Loft');
  });

  it('keeps a credit that is nothing but a marker rather than naming nobody', () => {
    expect(leadArtistName('  feat. Someone ')).toBe('feat. Someone');
  });
});

describe('findMatch', () => {
  it('returns null when nothing matches', () => {
    const subject = { externalIds: {}, nameKey: { primary: 'X', secondary: 'Y' } };
    const candidates = [album('1', 'Other Title', 'Other Artist')];

    expect(findMatch(subject, candidates, nameKeyOf)).toBeNull();
  });

  it('prefers an identifier match over a name match regardless of candidate order', () => {
    const subject = {
      externalIds: { mbid: 'shared-mbid' },
      nameKey: { primary: 'Album Title', secondary: 'Some Artist' },
    };
    const nameMatchCandidate = album('name-match', 'Album Title', 'Some Artist');
    const mbidCandidate = album('mbid-match', 'Different Title', 'Different Artist', {
      mbid: 'shared-mbid',
    });

    // Name-match candidate listed first: order must not decide the winner.
    const result = findMatch(subject, [nameMatchCandidate, mbidCandidate], nameKeyOf);

    expect(result).not.toBeNull();
    expect(result!.reason).toBe('mbid');
    expect(result!.confidence).toBe('exact');
    expect(result!.candidate).toBe(mbidCandidate);
  });

  it('prefers a stronger identifier over a weaker one regardless of candidate order', () => {
    const subject = {
      externalIds: { mbid: 'shared-mbid', deezerId: 'shared-deezer' },
      nameKey: { primary: 'X', secondary: 'Y' },
    };
    const deezerCandidate = album('deezer-match', 'A', 'B', { deezerId: 'shared-deezer' });
    const mbidCandidate = album('mbid-match', 'C', 'D', { mbid: 'shared-mbid' });

    // Weaker (deezerId) match listed first.
    const result = findMatch(subject, [deezerCandidate, mbidCandidate], nameKeyOf);

    expect(result).not.toBeNull();
    expect(result!.reason).toBe('mbid');
    expect(result!.candidate).toBe(mbidCandidate);
  });

  it('requires both title and artist to agree for the normalized-name fallback', () => {
    const subject = {
      externalIds: {},
      nameKey: { primary: 'Same Title', secondary: 'Artist A' },
    };
    const sameTitleDifferentArtist = album('1', 'Same Title', 'Artist B');

    expect(findMatch(subject, [sameTitleDifferentArtist], nameKeyOf)).toBeNull();
  });

  it('matches on the normalized-name fallback when both title and artist agree', () => {
    const subject = {
      externalIds: {},
      nameKey: { primary: '  Same Title  ', secondary: 'Artist A' },
    };
    const candidate = album('1', 'same   title', 'ARTIST A');

    const result = findMatch(subject, [candidate], nameKeyOf);

    expect(result).not.toBeNull();
    expect(result!.reason).toBe('normalizedName');
    expect(result!.confidence).toBe('heuristic');
    expect(result!.candidate).toBe(candidate);
  });

  it('matches an artist-style NameKey on name alone, with no secondary on either side', () => {
    interface ArtistLike extends Matchable {
      name: string;
    }
    const artistNameKeyOf = (a: ArtistLike): NameKey => ({ primary: a.name });
    const subject = { externalIds: {}, nameKey: { primary: 'The Artist' } };
    const candidate: ArtistLike = { localId: localId('a1'), externalIds: {}, name: 'the artist' };

    const result = findMatch(subject, [candidate], artistNameKeyOf);

    expect(result).not.toBeNull();
    expect(result!.reason).toBe('normalizedName');
    expect(result!.candidate).toBe(candidate);
  });

  it('does not mutate the subject or candidates, and returns the same candidate reference', () => {
    const subjectExternalIds: ExternalIds = { mbid: 'shared-mbid' };
    const subject = {
      externalIds: subjectExternalIds,
      nameKey: { primary: 'Album Title', secondary: 'Some Artist' },
    };
    const candidate = album('mbid-match', 'Different Title', 'Different Artist', {
      mbid: 'shared-mbid',
    });
    const nameOnlyCandidate = album('name-match', 'Other Title', 'Other Artist');

    const subjectSnapshot = JSON.parse(JSON.stringify(subject.externalIds));
    const candidateSnapshot = JSON.parse(JSON.stringify(candidate));
    const nameOnlyCandidateSnapshot = JSON.parse(JSON.stringify(nameOnlyCandidate));

    const candidates = [candidate, nameOnlyCandidate];
    const result = findMatch(subject, candidates, nameKeyOf);

    expect(subject.externalIds).toEqual(subjectSnapshot);
    expect(candidate).toEqual(candidateSnapshot);
    expect(nameOnlyCandidate).toEqual(nameOnlyCandidateSnapshot);
    expect(result!.candidate).toBe(candidate);
  });
});
