/**
 * Everything outside sources put on Home, declared in one place.
 *
 * Home, Home settings and the album page used to call Deezer and ListenBrainz
 * by name — each shelf fetched from its own company, and Explore wrote out a
 * header per company. Here each outside tier declares which source fills it,
 * its badge, its shelves and how they are built, and the fetchers behind them
 * are named for what they return. Feature code renders whatever is declared.
 */
import * as deezer from '@/providers/integration/deezer';
// The recommendation modules directly, not the barrel: the barrel also carries
// scrobbling, which reads the app version at import and has no place in Home.
import { getLBSimilarArtists } from '@/providers/integration/listenbrainz/recommendations/getSimilarArtists';
import { getCreatedForPlaylists, type CreatedForMixType } from '@/providers/integration/listenbrainz/recommendations/getCreatedForPlaylists';
import { sourceColor } from '@/constants/design';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { HOME_GENRE_ARTIST_LIMIT, HOME_RELATED_PER_SEED, HOME_SEED_ARTISTS } from '@/features/home/constants';
import {
  buildCatalogueSections,
  buildListenerSections,
  type HomeShelfSeeds,
  type SectionConfig,
} from '@/features/home/homeLayout';
import { selectListenBrainzUsername } from '@/state/redux/selectors/listenbrainzSelectors';
import type { RootState } from '@/state/redux/store';
import type { SourceId, SourceUseId } from './sources';

export type { CreatedForMixType };

/** The switch a shelf of each kind reads. */
export const CATALOGUE_HOME_USE: SourceUseId = 'deezer.homeShelves';
export const CATALOGUE_RECOMMENDATIONS_USE: SourceUseId = 'deezer.recommendations';
export const LISTENERS_HOME_USE: SourceUseId = 'listenbrainz.homeShelves';
export const LISTENERS_SIMILAR_USE: SourceUseId = 'listenbrainz.similarArtists';

type HomeSourceTier = {
  source: SourceId;
  badge: { letter: string; color: string };
  /** The shelves Home settings lists for this tier, in default order. */
  shelves: readonly string[];
  build: (seeds: HomeShelfSeeds) => SectionConfig[];
  /** Reshuffle the tier's shelves each day, so a catalogue feed changes. */
  shuffleDaily: boolean;
  /** Shelves that also need an account, and whether one is connected. */
  account?: {
    shelves: readonly string[];
    isConnected: (state: RootState) => boolean;
    connectRoute: '/settings/listenbrainzView';
  };
};

/** The outside tiers on Home, in screen order. */
export const HOME_SOURCE_TIERS: readonly HomeSourceTier[] = [
  {
    source: 'listenbrainz',
    badge: { letter: 'B', color: sourceColor.listenbrainz },
    shelves: ['lbSimilarArtistsForYou', 'lbCreatedForDailyJams', 'lbCreatedForWeeklyJams', 'lbCreatedForWeeklyExploration'],
    build: buildListenerSections,
    shuffleDaily: false,
    account: {
      shelves: ['lbCreatedForDailyJams', 'lbCreatedForWeeklyJams', 'lbCreatedForWeeklyExploration'],
      isConnected: state => Boolean(selectListenBrainzUsername(state)),
      connectRoute: '/settings/listenbrainzView',
    },
  },
  {
    source: 'deezer',
    badge: { letter: 'D', color: sourceColor.deezer },
    shelves: ['topArtists', 'charts'],
    build: buildCatalogueSections,
    shuffleDaily: true,
  },
];

// --- The catalogue: charts, related artists and their albums ---------------

export const fetchChartAlbums = (limit: number): Promise<Album[]> => deezer.getDeezerChartAlbums(limit);

export const fetchChartArtists = (limit: number): Promise<Artist[]> => deezer.getDeezerChartArtists(limit);

type CollectCoveredAlbumsOptions = {
  targetAlbums: number;
  albumsPerArtist?: number;
  artistBatchSize?: number;
  excludeAlbumIds?: Iterable<string>;
};

/** One album with a cover per artist, batch by batch, until there are enough. */
async function collectCoveredAlbumsForArtists(
  artists: Artist[],
  { targetAlbums, albumsPerArtist = 5, artistBatchSize = 4, excludeAlbumIds = [] }: CollectCoveredAlbumsOptions
): Promise<Album[]> {
  if (targetAlbums <= 0) return [];

  const albums: Album[] = [];
  const seenAlbums = new Set(excludeAlbumIds);

  for (let i = 0; i < artists.length && albums.length < targetAlbums; i += artistBatchSize) {
    const results = await Promise.allSettled(
      artists.slice(i, i + artistBatchSize).map(async artist => {
        const artistAlbums = await deezer.getDeezerArtistAlbums(artist.nativeId, albumsPerArtist, artist);
        return artistAlbums.find(a => a.cover.kind !== 'none') ?? null;
      })
    );

    for (const result of results) {
      if (albums.length >= targetAlbums) break;
      if (result.status !== 'fulfilled' || !result.value || seenAlbums.has(result.value.nativeId)) continue;
      seenAlbums.add(result.value.nativeId);
      albums.push(result.value);
    }
  }

  return albums;
}

/** Albums by artists related to one, leaving out artists already in the library. */
export async function fetchAlbumsLikeArtist(
  artistName: string,
  libraryArtistNames: Set<string>,
  { relatedLimit, targetAlbums }: { relatedLimit: number; targetAlbums: number }
): Promise<Album[]> {
  const seed = await deezer.resolveDeezerArtistByName(artistName);
  if (!seed) return [];
  const related = await deezer.getDeezerRelatedArtists(seed.nativeId, relatedLimit);
  const fresh = related.filter(artist => !libraryArtistNames.has(artist.name.toLowerCase()));
  return collectCoveredAlbumsForArtists(fresh, { targetAlbums });
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_/]+/g, ' ').trim();
}

function findCatalogueGenreId(libraryGenre: string, genres: { id: number; name: string }[]): number | null {
  const needle = normalize(libraryGenre);
  if (!needle) return null;
  const exact = genres.find(g => normalize(g.name) === needle);
  if (exact) return exact.id;
  const sub = genres.find(g => {
    const n = normalize(g.name);
    return n && needle.includes(n);
  });
  if (sub) return sub.id;
  const rev = genres.find(g => {
    const n = normalize(g.name);
    return n && n.includes(needle);
  });
  return rev?.id ?? null;
}

/**
 * Albums for a genre: first from artists related to the library's own artists
 * in that genre, then topped up from the catalogue's artists for the genre.
 */
export async function fetchAlbumsForGenre(
  genre: string,
  seedArtistNames: string[],
  libraryArtistNames: Set<string>,
  itemCount: number
): Promise<Album[]> {
  const albums: Album[] = [];
  if (seedArtistNames.length > 0) {
    const seedArtists = (await Promise.allSettled(
      seedArtistNames.slice(0, HOME_SEED_ARTISTS).map(name => deezer.resolveDeezerArtistByName(name))
    ))
      .map(result => result.status === 'fulfilled' ? result.value : null)
      .filter((artist): artist is NonNullable<typeof artist> => Boolean(artist));

    const relatedGroups = await Promise.allSettled(
      seedArtists.map(seed => deezer.getDeezerRelatedArtists(seed.nativeId, HOME_RELATED_PER_SEED))
    );

    const seenArtists = new Set<string>();
    const relatedArtists = relatedGroups
      .flatMap(result => result.status === 'fulfilled' ? result.value : [])
      .filter(artist => {
        const nameKey = artist.name.toLowerCase();
        if (libraryArtistNames.has(nameKey) || seenArtists.has(nameKey)) return false;
        seenArtists.add(nameKey);
        return true;
      });

    albums.push(...await collectCoveredAlbumsForArtists(relatedArtists, { targetAlbums: itemCount }));
  }

  if (albums.length >= itemCount) return albums;

  const genreList = await deezer.getDeezerGenreList();
  const genreId = findCatalogueGenreId(genre, genreList);
  if (!genreId) return albums;

  const artists = await deezer.getDeezerArtistsByGenreId(genreId, HOME_GENRE_ARTIST_LIMIT);
  const fresh = artists.filter(a => !libraryArtistNames.has(a.name.toLowerCase()));

  albums.push(...await collectCoveredAlbumsForArtists(fresh, {
    targetAlbums: itemCount - albums.length,
    excludeAlbumIds: albums.map(album => album.nativeId),
  }));
  return albums.slice(0, itemCount);
}

// --- Listeners: what people who play an artist also play ------------------

/**
 * Artists similar to one, by MusicBrainz id, from what listeners play. The
 * graph names no artist id of its own, so the MBID doubles as `nativeId`.
 */
export async function fetchSimilarArtistsFromListeners(
  mbid: string,
  limit: number,
  excludeName?: string
): Promise<Artist[]> {
  const raw = await getLBSimilarArtists(mbid, limit);
  const provenance = integrationProvenance('listenbrainz');
  const exclude = excludeName?.trim().toLowerCase();
  return raw
    .filter(artist => !exclude || artist.name.trim().toLowerCase() !== exclude)
    .map((artist): Artist => ({
      localId: makeLocalId('artist', provenance, artist.artistMbid),
      nativeId: artist.artistMbid,
      provenance,
      externalIds: { mbid: artist.artistMbid },
      libraryState: 'external',
      name: artist.name,
      cover: { kind: 'none' },
      tags: [],
      albumIds: [],
    }));
}

/** One of the account's made-for-you mixes, or no tracks if it has none. */
export async function fetchMadeForYouMix(username: string, mixType: CreatedForMixType): Promise<Song[]> {
  const mixes = await getCreatedForPlaylists(username);
  return mixes.find(mix => mix.mixType === mixType)?.tracks ?? [];
}
