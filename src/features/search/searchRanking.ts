import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { CoverSource } from '@/domain/entities/Cover';
import type { Song } from '@/domain/entities/Song';

/**
 * Ordering and de-duplication of search results.
 *
 * Split out of SearchContext because this decides what a user actually sees on
 * the most-used screen in the app: results arrive from three places at once
 * (the on-device index, the server, Deezer) and the same record often comes
 * back from more than one.
 */

export interface SearchResult {
  id: string;
  title: string;
  subtext: string;
  /**
   * An album's artist by name, when `subtext` is decorated (an external
   * catalogue's "Artist · year") and so cannot stand in for it. Lookups read
   * this in preference to `subtext`.
   */
  artistName?: string;
  cover: CoverSource;
  type: 'song' | 'album' | 'artist' | 'playlist';
  source: 'local' | 'external';
  /** Which integration supplied it, as an opaque provider id. */
  externalSource?: string;
  /**
   * The ids the entity itself carries, in the domain's own shape rather than a
   * restatement of it. An artist's ids are not among them: they belong to the
   * artist, and the one consumer that needs them (acquisition matching) reads
   * them off the artist reference on a domain album, not off a search row.
   */
  externalIds?: ExternalIds;
  isDownloaded: boolean;
  song?: Song;
}

/** Identity of a result: the same id from the library and from Deezer are
 * different results, and a song and an album may share an id. */
export const resultKey = (result: SearchResult) =>
  `${result.source}:${result.type}:${result.id}`;

const sourceRank = (source: SearchResult['source']) => (source === 'local' ? 1 : 2);

const typeRank = (type: SearchResult['type']) =>
  type === 'song' ? 1 : type === 'album' ? 2 : type === 'artist' ? 3 : 4;

/**
 * Collapses duplicates, keeping the downloaded copy when one exists — an
 * offline-playable result is strictly more useful than the same record without
 * a local file.
 */
export function dedupeResults(results: SearchResult[]): SearchResult[] {
  const byKey = new Map<string, SearchResult>();
  for (const result of results) {
    const key = resultKey(result);
    const existing = byKey.get(key);
    if (!existing || (!existing.isDownloaded && result.isDownloaded)) {
      byKey.set(key, result);
    }
  }
  return [...byKey.values()];
}

/**
 * Ranks results by, in order: what the user owns (library before Deezer, then
 * downloaded before streamed), how well the title answers what they typed
 * (exact, then containing), and only then a stable type and alphabetical
 * ordering so equal results don't shuffle between keystrokes.
 */
export function compareResults(
  a: SearchResult,
  b: SearchResult,
  lowerQuery: string
): number {
  const sourceDiff = sourceRank(a.source) - sourceRank(b.source);
  if (sourceDiff !== 0) return sourceDiff;

  if (a.isDownloaded !== b.isDownloaded) return a.isDownloaded ? -1 : 1;

  const aTitle = a.title.toLowerCase();
  const bTitle = b.title.toLowerCase();

  const aExact = aTitle === lowerQuery;
  const bExact = bTitle === lowerQuery;
  if (aExact !== bExact) return aExact ? -1 : 1;

  const aContains = aTitle.includes(lowerQuery);
  const bContains = bTitle.includes(lowerQuery);
  if (aContains !== bContains) return aContains ? -1 : 1;

  // Two results from one outside catalogue stay in the order that catalogue
  // gave them. It ranked them (by how well known they are, for MusicBrainz),
  // and the type and alphabetical tie-breaks below would only undo that: a
  // search for an artist whose name is also the title of dozens of albums
  // would bury the artist under all of them.
  if (
    a.source === 'external' &&
    b.source === 'external' &&
    a.externalSource === b.externalSource
  ) {
    return 0;
  }

  const typeDiff = typeRank(a.type) - typeRank(b.type);
  if (typeDiff !== 0) return typeDiff;

  return aTitle.localeCompare(bTitle);
}

export function dedupeAndSort(
  results: SearchResult[],
  lowerQuery: string
): SearchResult[] {
  // Ties keep their arrival order explicitly, rather than trusting the
  // engine's sort to be stable.
  return dedupeResults(results)
    .map((result, index) => ({ result, index }))
    .sort((a, b) => compareResults(a.result, b.result, lowerQuery) || a.index - b.index)
    .map(({ result }) => result);
}
