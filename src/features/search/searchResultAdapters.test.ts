import type { SearchResult } from '@/features/search/searchRanking';
import { resultToAlbum, resultToArtist, isExternalArtist } from './searchResultAdapters';

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
    expect(album.libraryState).toBe('in-library');
    expect(album.nativeId).toBe('x-1');
  });

  it('builds an integration-provenance album for an external result, tagged with its own source', () => {
    const external: SearchResult = { ...baseResult, source: 'external', externalSource: 'deezer', id: 'dz-1' };
    const album = resultToAlbum(external, 'srv-1');
    expect(album.provenance).toEqual({ origin: 'integration', providerId: 'deezer' });
    expect(album.libraryState).toBe('external');
  });
});

describe('resultToArtist', () => {
  it('marks a local result in-library regardless of activeServerId presence', () => {
    const artist = resultToArtist({ ...baseResult, type: 'artist' }, undefined);
    expect(isExternalArtist(artist)).toBe(false);
  });

  it('marks an external result external, and downloaded external results in-library', () => {
    const notDownloaded = resultToArtist({ ...baseResult, type: 'artist', source: 'external', externalSource: 'musicbrainz' }, undefined);
    expect(isExternalArtist(notDownloaded)).toBe(true);
    expect(notDownloaded.libraryState).toBe('external');

    const downloaded = resultToArtist(
      { ...baseResult, type: 'artist', source: 'external', externalSource: 'musicbrainz', isDownloaded: true },
      undefined
    );
    expect(downloaded.libraryState).toBe('in-library');
  });
});
