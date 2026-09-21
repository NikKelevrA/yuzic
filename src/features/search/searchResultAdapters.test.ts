import type { SearchResult } from '@/features/search/searchRanking';
import { resultToAlbum, resultToArtist, isExternalArtist, entityToAlbum } from './searchResultAdapters';

const baseResult: SearchResult = {
  id: 'x-1',
  title: 'Rumours',
  subtext: 'Fleetwood Mac',
  cover: { kind: 'none' },
  type: 'album',
  source: 'local',
  isDownloaded: false,
};

describe('resultToAlbum', () => {
  it('builds a server-provenance album for a local result', () => {
    const album = resultToAlbum(baseResult, 'srv-1');
    expect(album.provenance).toEqual({ origin: 'server', serverId: 'srv-1' });
    expect(album.nativeId).toBe('x-1');
  });

  it('builds an integration-provenance album for an external result, tagged with its own source', () => {
    const external: SearchResult = { ...baseResult, source: 'external', externalSource: 'deezer', id: 'dz-1' };
    const album = resultToAlbum(external, 'srv-1');
    expect(album.provenance).toEqual({ origin: 'integration', providerId: 'deezer' });
  });
});

describe('external album artist name', () => {
  const decorated: SearchResult = {
    ...baseResult,
    source: 'external',
    externalSource: 'musicbrainz',
    id: 'rg-1',
    title: 'In the End',
    subtext: 'Linkin Park · 2001',
    artistName: 'Linkin Park',
  };

  it('uses the artist name, never the decorated second line, as the album artist', () => {
    expect(resultToAlbum(decorated, 'srv-1').artist.name).toBe('Linkin Park');
  });

  it('falls back to the subtext for a catalogue whose second line is the artist', () => {
    const deezer: SearchResult = { ...decorated, artistName: undefined, subtext: 'Daft Punk' };
    expect(resultToAlbum(deezer, 'srv-1').artist.name).toBe('Daft Punk');
  });

  it('keeps the artist name when reopened from search history', () => {
    const album = entityToAlbum({
      kind: 'entity',
      type: 'album',
      id: 'rg-1',
      title: 'In the End',
      subtitle: 'Linkin Park · 2001',
      artistName: 'Linkin Park',
      cover: { kind: 'none' },
      source: 'external',
      externalSource: 'musicbrainz',
    });
    expect(album.artist.name).toBe('Linkin Park');
  });
});

describe('resultToArtist', () => {
  it('marks a local result in-library regardless of activeServerId presence', () => {
    const artist = resultToArtist({ ...baseResult, type: 'artist' }, undefined);
    expect(isExternalArtist(artist)).toBe(false);
  });

  it('marks an external result external, downloaded or not', () => {
    // Downloaded is a search-ranking fact, not a provenance one: having a copy
    // does not make a MusicBrainz artist a library artist.
    const external = { ...baseResult, type: 'artist' as const, source: 'external' as const, externalSource: 'musicbrainz' };

    expect(isExternalArtist(resultToArtist(external, undefined))).toBe(true);
    expect(isExternalArtist(resultToArtist({ ...external, isDownloaded: true }, undefined))).toBe(true);
  });
});
