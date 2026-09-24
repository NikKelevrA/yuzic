/**
 * What gets searched, where, and in what order.
 *
 * Split out of `SearchContext` because the three legs — the on-device index,
 * the music server, and "Other sources" — are a decision about which sources
 * to ask and how to turn what they return into a `SearchResult`, not state.
 * `SearchContext` still owns *when* to run these (debounce, request-id
 * guarding, the library data itself); this owns the mapping and dispatch.
 *
 * External sources are asked through the capability broker's
 * `catalogue.search` — whichever keyless integration can search a catalogue
 * answers, and this file never names one. Each source is settled on its own,
 * so one over its rate limit (both Deezer and MusicBrainz enforce one, see
 * `providers/http/rateLimit.ts`) cannot throw away the others' results.
 */
import { offersFor } from '@/providers/registry/capabilityBroker';
import { KEYLESS_INTEGRATIONS } from '@/providers/registry/keyless';
import type { CoverSource } from '@/domain/entities/Cover';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import type { SearchResult } from '@/features/search/searchRanking';

/** Entity types an external source can be asked to return. Deliberately
 *  narrower than the library's four kinds — 'playlist' has no external
 *  equivalent through Deezer/MusicBrainz today, so filtering on it would just
 *  always empty out; the Filters UI only offers what a source actually
 *  supports. 'song' joined this list once MusicBrainz gained a real recording
 *  search (`searchRecording`/`mapRecordingSearchHit`) — a provider with none
 *  of its own, Deezer today, is simply asked for none and returns none, the
 *  same way it already handles 'artists'/'albums' being turned off. */
export type SearchEntityType = 'album' | 'artist' | 'song';

export const ALL_SEARCH_ENTITY_TYPES: SearchEntityType[] = ['album', 'artist', 'song'];

// --- result mapping: library entity -> SearchResult -------------------------

function albumToResult(
  album: { id: string; title: string; subtext: string; cover: CoverSource },
  isDownloaded: boolean
): SearchResult {
  return { id: album.id, title: album.title, subtext: album.subtext, cover: album.cover, type: 'album', source: 'local', isDownloaded };
}

function artistToResult(
  artist: { id: string; name: string; subtext: string; cover: CoverSource }
): SearchResult {
  return { id: artist.id, title: artist.name, subtext: artist.subtext, cover: artist.cover, type: 'artist', source: 'local', isDownloaded: true };
}

/**
 * `SearchResult.song` no longer carries a domain `Song` for a library match.
 * The entity has no `streamUrl` (see the domain `Song` doc — it's
 * credentialled and built on demand), and this row's own `Song` type still
 * requires one, so there's nothing safe to attach here without fabricating a
 * URL nobody asked for yet. Screens fall back to resolving the track by id
 * when they actually play it, same as they already do for any result that
 * arrives without one.
 */
function songToResult(
  song: { id: string; title: string; artist: string; cover: CoverSource },
  isDownloaded: boolean
): SearchResult {
  return { id: song.id, title: song.title, subtext: song.artist, cover: song.cover, type: 'song', source: 'local', isDownloaded };
}

function playlistToResult(
  playlist: { id: string; title: string; subtext: string; cover: CoverSource },
  isDownloaded: boolean
): SearchResult {
  return { id: playlist.id, title: playlist.title, subtext: playlist.subtext, cover: playlist.cover, type: 'playlist', source: 'local', isDownloaded };
}

/**
 * Presentation strings the domain entities no longer carry (`subtext` was
 * dropped as a stored field — see the domain `EntityCore` doc). Kept in one
 * place rather than inlined at each `*ToResult` call site.
 */
const albumSubtext = (album: Album): string => album.artist.name;
const playlistSubtext = (playlist: Playlist): string => playlist.description ?? '';

const albumSearchRow = (album: Album) => ({ id: album.nativeId, title: album.title, subtext: albumSubtext(album), cover: album.cover });
const artistSearchRow = (artist: Artist) => ({ id: artist.nativeId, name: artist.name, subtext: '', cover: artist.cover });
const playlistSearchRow = (playlist: Playlist) => ({ id: playlist.nativeId, title: playlist.title, subtext: playlistSubtext(playlist), cover: playlist.cover });
const songSearchRow = (song: Song) => ({ id: song.nativeId, title: song.title, artist: song.artist.name, cover: song.cover });

/** Pre-lowercased library indices, built once per library change rather than
 *  once per keystroke — see `SearchContext`'s `searchIndex` memo. */
export type SearchIndex = {
  tracks: { item: Song; lc: string }[];
  albums: { item: Album; lc: string }[];
  artists: { item: Artist; lc: string }[];
  playlists: { item: Playlist; lc: string }[];
};

export type DownloadedIds = {
  tracks: Set<string>;
  albums: Set<string>;
  playlists: Set<string>;
};

/**
 * How many of each kind the on-device index leg keeps.
 *
 * A plain filter over an in-memory index, already lower-cased — even a large
 * library costs nothing extra to slice further out, so this was never a
 * performance cap. It used to be a display one (5/3/3/5), tight enough that a
 * common query (an artist with a big discography, a word that shows up in a
 * lot of titles) ran out of room well before the library did. Raised evenly
 * across all four kinds instead of guessing which one mattered most.
 */
const MAX_LIBRARY_RESULTS = 50;

/** The on-device index leg: local, synchronous, always available. */
export function searchLibraryLeg(searchIndex: SearchIndex, query: string, downloaded: DownloadedIds): SearchResult[] {
  const lowerQuery = query.toLowerCase();

  const albumResults = searchIndex.albums
    .filter(({ lc }) => lc.includes(lowerQuery))
    .slice(0, MAX_LIBRARY_RESULTS)
    .map(({ item }) => albumToResult(albumSearchRow(item), downloaded.albums.has(item.nativeId)));

  const artistResults = searchIndex.artists
    .filter(({ lc }) => lc.includes(lowerQuery))
    .slice(0, MAX_LIBRARY_RESULTS)
    .map(({ item }) => artistToResult(artistSearchRow(item)));

  const playlistResults = searchIndex.playlists
    .filter(({ lc }) => lc.includes(lowerQuery))
    .slice(0, MAX_LIBRARY_RESULTS)
    .map(({ item }) => playlistToResult(playlistSearchRow(item), downloaded.playlists.has(item.nativeId)));

  const songResults = searchIndex.tracks
    .filter(({ lc }) => lc.includes(lowerQuery))
    .slice(0, MAX_LIBRARY_RESULTS)
    .map(({ item }) => songToResult(songSearchRow(item), downloaded.tracks.has(item.nativeId)));

  return [...songResults, ...albumResults, ...artistResults, ...playlistResults];
}

/** Minimal shape of `useApi()['search']` — the api client's search namespace. */
type ServerSearchApi = {
  search: (query: string) => Promise<{ albums?: Album[]; artists?: Artist[]; songs?: Song[] }>;
} | undefined;

/** The music-server leg: asks the origin server directly, for library scope
 *  when `searchScope` is `'server'`. `searchApi` is `useApi().search`. */
export async function searchServerLeg(searchApi: ServerSearchApi, query: string, downloaded: DownloadedIds): Promise<SearchResult[]> {
  if (!searchApi) return [];
  const { albums = [], artists = [], songs = [] } = await searchApi.search(query);
  return [
    ...songs.map(song => songToResult(songSearchRow(song), downloaded.tracks.has(song.nativeId))),
    ...albums.map(album => albumToResult(albumSearchRow(album), downloaded.albums.has(album.nativeId))),
    ...artists.map(artist => artistToResult(artistSearchRow(artist))),
  ];
}

/**
 * The "Other sources" leg. Fans the query out to every requested source in
 * parallel through its own `search()` capability and concatenates the
 * results with each source's own id intact as `externalSource` — never
 * merged into one undifferentiated list, and never merged with the library
 * legs above (see `src/contexts/searchLegs.ts#planSearchLegs`).
 *
 * Deliberately does not merge across sources: a MusicBrainz release group
 * and a Deezer album for the same record are two different editions/ids with
 * no shared key to merge on here (no ISRC/UPC cross-match computed at query
 * time), so collapsing them would either drop a real edition or guess at a
 * match with no confidence signal. Keeping them as separate, source-labelled
 * rows is the conservative choice the locked design calls for ("keep
 * editions/recordings and ambiguous matches separate"). `dedupeAndSort`'s
 * existing key (`source:type:id`) still collapses true duplicates — the same
 * source returning the same id twice.
 */
export async function searchExternalLeg(
  sourceIds: string[],
  query: string,
  entityTypes: SearchEntityType[]
): Promise<SearchResult[]> {
  if (!query.trim() || sourceIds.length === 0) return [];
  const kinds = {
    artists: entityTypes.includes('artist'),
    albums: entityTypes.includes('album'),
    songs: entityTypes.includes('song'),
  };

  // Asked of the broker, not of a list of sources: whoever can search a
  // catalogue answers, and search never learns who that is. The enabled set
  // arrives as ids from `planSearchLegs`, which remains the only authority on
  // whether this leg runs at all.
  const offers = offersFor(
    {
      providers: KEYLESS_INTEGRATIONS,
      isConnected: id => sourceIds.includes(id),
      isAllowed: id => sourceIds.includes(id),
      order: sourceIds,
    },
    'catalogue.search'
  );
  if (offers.length === 0) return [];

  // Settled one by one: a source over its rate limit, or simply down, must not
  // take the others' answers with it. The leg fails only when nobody answered.
  const settled = await Promise.allSettled(
    offers.map(async offer => ({
      providerId: offer.providerId,
      found: await offer.invoke(query, kinds),
    }))
  );
  const perProvider = settled.flatMap(outcome => (outcome.status === 'fulfilled' ? [outcome.value] : []));
  if (perProvider.length === 0) {
    const firstFailure = settled.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    throw firstFailure?.reason ?? new Error('No external source answered');
  }

  const results: SearchResult[] = [];
  for (const { providerId, found } of perProvider) {
    for (const { entity, subtitle } of found.artists) {
      results.push({
        id: entity.nativeId,
        title: entity.name,
        subtext: subtitle,
        cover: entity.cover,
        type: 'artist',
        source: 'external',
        externalSource: providerId,
        externalIds: entity.externalIds,
        isDownloaded: false,
      });
    }
    for (const { entity, subtitle, artistName } of found.albums) {
      results.push({
        id: entity.nativeId,
        title: entity.title,
        subtext: subtitle,
        artistName,
        cover: entity.cover,
        type: 'album',
        source: 'external',
        externalSource: providerId,
        externalIds: entity.externalIds,
        isDownloaded: false,
      });
    }
    // A song's own domain entity rides along on `song` — unlike a library
    // match (see `songToResult`'s comment), there is a real one here, and it
    // is what a song row needs to navigate to the album it's on, since it has
    // nothing to play. `entity.externalIds` would be the recording's ids;
    // `song` carries those instead of the row's own `externalIds`, since
    // nothing here matches a song against the library the way an album/artist
    // row's `externalIds` is used for.
    for (const { entity, subtitle } of found.songs ?? []) {
      results.push({
        id: entity.nativeId,
        title: entity.title,
        subtext: subtitle,
        cover: entity.cover,
        type: 'song',
        source: 'external',
        externalSource: providerId,
        isDownloaded: false,
        song: entity,
      });
    }
  }
  return results;
}
