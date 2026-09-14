import type { Storage } from 'redux-persist';

import { importLegacySourceSettings } from './legacySourceSettings';

/** A store holding slices the way redux-persist writes them: JSON of JSON. */
function storageWith(slices: Record<string, Record<string, unknown>>): Storage {
  const records = Object.fromEntries(
    Object.entries(slices).map(([key, fields]) => [
      `persist:${key}`,
      JSON.stringify(Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, JSON.stringify(value)]))),
    ])
  );
  return {
    getItem: async (key: string) => records[key] ?? null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  };
}

describe('importLegacySourceSettings', () => {
  it('turns nothing on for a fresh install', async () => {
    expect(await importLegacySourceSettings(storageWith({}))).toEqual({});
  });

  it("keeps everything one old switch covered: Deezer's discovery switch becomes each thing it turned on", async () => {
    const uses = await importLegacySourceSettings(storageWith({
      settingsHome: { deezerDiscoveryEnabled: true, listenbrainzDiscoveryEnabled: false },
    }));
    expect(uses).toEqual({
      'deezer.homeShelves': true,
      'deezer.similarArtists': true,
      'deezer.popularTracks': true,
      'deezer.previews': true,
      'deezer.recommendations': true,
    });
  });

  it('carries search, artwork, Last.fm, ListenBrainz and lyrics switches across', async () => {
    const uses = await importLegacySourceSettings(storageWith({
      settingsHome: { listenbrainzDiscoveryEnabled: true },
      settingsSearch: { searchSourcesEnabled: { deezer: false, musicbrainz: true } },
      settingsMetadata: { lastfmEnabled: true, metadataArtworkEnabled: { coverartarchive: true } },
      settingsLyrics: { lyricsExternalSourcesEnabled: { lrclib: true } },
    }));
    expect(uses).toEqual({
      'listenbrainz.homeShelves': true,
      'listenbrainz.similarArtists': true,
      'musicbrainz.search': true,
      'lastfm.artistInfo': true,
      'lastfm.similarArtists': true,
      'lastfm.recommendations': true,
      'coverartarchive.artwork': true,
      'lrclib.lyrics': true,
    });
  });

  it('ignores a record it cannot read rather than failing startup', async () => {
    const storage: Storage = {
      getItem: async () => 'not json',
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    expect(await importLegacySourceSettings(storage)).toEqual({});
  });
});
