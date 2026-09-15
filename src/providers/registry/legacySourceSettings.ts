import type { Storage } from 'redux-persist';

import type { SourceUseId } from './sources';

/**
 * The switches from before sources were organised by purpose, turned into
 * uses — once, the first time the new settings are read.
 *
 * They lived in four other slices (Home, Search, Metadata, Lyrics), which no
 * longer carry them, so this reads those slices' stored records directly
 * rather than their live state. Whatever was on stays on: one old switch that
 * covered several things becomes each of those things switched on, so nobody
 * loses a shelf or a preview they had.
 */

type Stored = Record<string, unknown>;

/** redux-persist stores a slice as a JSON object whose values are themselves JSON. */
async function readStored(storage: Storage, key: string): Promise<Stored> {
  try {
    const raw = await storage.getItem(`persist:${key}`);
    if (!raw) return {};
    const outer = JSON.parse(raw) as Record<string, string>;
    const parsed: Stored = {};
    for (const [field, value] of Object.entries(outer)) {
      try {
        parsed[field] = JSON.parse(value);
      } catch {
        parsed[field] = undefined;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

const flag = (record: unknown, key: string): boolean =>
  typeof record === 'object' && record !== null && (record as Record<string, unknown>)[key] === true;

export async function importLegacySourceSettings(storage: Storage): Promise<Partial<Record<SourceUseId, boolean>>> {
  const [home, search, metadata, lyrics] = await Promise.all([
    readStored(storage, 'settingsHome'),
    readStored(storage, 'settingsSearch'),
    readStored(storage, 'settingsMetadata'),
    readStored(storage, 'settingsLyrics'),
  ]);

  const on = new Set<SourceUseId>();
  const turnOn = (...uses: SourceUseId[]) => uses.forEach(use => on.add(use));

  // Deezer's one discovery switch covered its shelves, pages and previews.
  if (home.deezerDiscoveryEnabled === true) {
    turnOn('deezer.homeShelves', 'deezer.similarArtists', 'deezer.popularTracks', 'deezer.previews', 'deezer.recommendations');
  }
  if (home.listenbrainzDiscoveryEnabled === true) {
    turnOn('listenbrainz.homeShelves', 'listenbrainz.similarArtists');
  }
  if (flag(search.searchSourcesEnabled, 'deezer')) turnOn('deezer.search');
  if (flag(search.searchSourcesEnabled, 'musicbrainz')) turnOn('musicbrainz.search');
  // Last.fm's one switch covered bios, similar artists and playlist recommendations.
  if (metadata.lastfmEnabled === true || flag(metadata.metadataArtistInfoEnabled, 'lastfm')) {
    turnOn('lastfm.artistInfo', 'lastfm.similarArtists', 'lastfm.recommendations');
  }
  if (flag(metadata.metadataArtworkEnabled, 'deezer')) turnOn('deezer.artwork');
  if (flag(metadata.metadataArtworkEnabled, 'coverartarchive')) turnOn('coverartarchive.artwork');
  if (flag(lyrics.lyricsExternalSourcesEnabled, 'lrclib')) turnOn('lrclib.lyrics');

  return Object.fromEntries([...on].map(use => [use, true]));
}
