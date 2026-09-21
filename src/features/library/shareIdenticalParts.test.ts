import { shareIdenticalParts } from './shareIdenticalParts';

/** A track as parsed from the stored catalog: every part a fresh copy. */
function parsedTrack(id: number, artist: number, overrides: Record<string, unknown> = {}) {
  return JSON.parse(JSON.stringify({
    localId: `local:song:srv:s1:song-${id}`,
    nativeId: `song-${id}`,
    provenance: { origin: 'server', serverId: 's1' },
    externalIds: {},
    title: `Track ${id}`,
    artist: {
      localId: `local:artist:srv:s1:artist-${artist}`,
      nativeId: `artist-${artist}`,
      externalIds: {},
      name: `Artist ${artist}`,
      cover: { kind: 'none', subject: { kind: 'artist', name: `Artist ${artist}` } },
    },
    album: {
      localId: 'local:album:srv:s1:album-1',
      nativeId: 'album-1',
      externalIds: {},
      title: 'Album',
      cover: { kind: 'jellyfin', itemId: 'album-1' },
    },
    genres: ['Rock', 'Indie'],
    ...overrides,
  }));
}

describe('shareIdenticalParts', () => {
  it('gives every entity the same instance of a part they all repeat', () => {
    const [a, b] = shareIdenticalParts([parsedTrack(1, 7), parsedTrack(2, 7)]);

    expect(a.provenance).toBe(b.provenance);
    expect(a.externalIds).toBe(b.externalIds);
    expect(a.artist).toBe(b.artist);
    expect(a.album).toBe(b.album);
    expect(a.genres).toBe(b.genres);
  });

  it('changes nothing anyone reads', () => {
    const list = [parsedTrack(1, 7), parsedTrack(2, 8), parsedTrack(3, 7)];
    const before = JSON.stringify(list);

    expect(JSON.stringify(shareIdenticalParts(list))).toBe(before);
  });

  it('keeps references apart that name the same artist but differ', () => {
    // Two tags that resolve to one artist id but spell the name differently:
    // sharing them would rename the artist on one of the tracks.
    const other = parsedTrack(2, 7);
    other.artist.name = 'ARTIST 7';
    const [a, b] = shareIdenticalParts([parsedTrack(1, 7), other]);

    expect(a.artist).not.toBe(b.artist);
    expect(b.artist.name).toBe('ARTIST 7');
  });

  it('shares an empty externalIds but never one that holds an id', () => {
    const [a, b, c] = shareIdenticalParts([
      parsedTrack(1, 7),
      parsedTrack(2, 7),
      parsedTrack(3, 7, { externalIds: { mbid: 'abc' } }),
    ]);

    expect(a.externalIds).toBe(b.externalIds);
    expect(c.externalIds).toEqual({ mbid: 'abc' });
    expect(c.externalIds).not.toBe(a.externalIds);
  });

  it('keeps a write to the shared empty externalIds from reaching every entity', () => {
    const [a, b] = shareIdenticalParts([parsedTrack(1, 7), parsedTrack(2, 8)]);

    // Ignored rather than thrown in non-strict code, as the app is compiled.
    try { (a.externalIds as Record<string, string>).mbid = 'x'; } catch { /* strict mode */ }

    expect(a.externalIds).toEqual({});
    expect(b.externalIds).toEqual({});
  });

  it('leaves a frozen entity alone rather than throwing', () => {
    const frozen = Object.freeze(parsedTrack(1, 7));

    expect(() => shareIdenticalParts([frozen, parsedTrack(2, 7)])).not.toThrow();
  });

  it('passes through anything that is not a list', () => {
    const starred = { songs: [], albums: [] };

    expect(shareIdenticalParts(starred)).toBe(starred);
    expect(shareIdenticalParts(undefined)).toBeUndefined();
  });
});
