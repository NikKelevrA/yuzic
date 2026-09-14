/**
 * What outside sources put on artist, album and playlist pages — previews,
 * similar artists from scrobbles, playlist recommendations — declared with
 * the other provider declarations, so those pages ask for "previews" or
 * "similar artists" and never name the company answering.
 */
import * as deezer from '@/providers/integration/deezer';
import { getLastFmSimilarArtists } from '@/providers/integration/lastfm/getSimilarArtists';
import { searchArtist } from '@/providers/integration/musicbrainz';
import { LASTFM_API_KEY } from '@/constants/keys';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';
import shuffleArray from '@/features/playback/shuffleArray';
import type { SourceUseId } from './sources';
import { withArtistArtwork } from './artistArtwork';

/** The switch each of these reads. */
export const PREVIEWS_USE: SourceUseId = 'deezer.previews';
export const SCROBBLES_SIMILAR_USE: SourceUseId = 'lastfm.similarArtists';
export const SCROBBLES_RECOMMENDATIONS_USE: SourceUseId = 'lastfm.recommendations';
export const CATALOGUE_TRACKS_RECOMMENDATIONS_USE: SourceUseId = 'deezer.recommendations';
export const ARTIST_ID_LOOKUP_USE: SourceUseId = 'musicbrainz.search';

/** Similar artists from scrobbles need the bundled key; without one there is nothing to ask. */
export const SCROBBLES_AVAILABLE = Boolean(LASTFM_API_KEY);

// --- Previews ----------------------------------------------------------------

/**
 * A thirty-second clip for each track of an album the user does not own,
 * keyed by the track's `nativeId` — one origin, so its own ids are
 * unambiguous and are what the rows already carry.
 *
 * A track already carrying a clip on `streamId` needs nothing fetched: a
 * sample's URL is issued once and cannot be rebuilt, which is why it travels
 * with the entity. Otherwise the album is searched for and its tracks matched
 * by position first and title second — position is reliable within a
 * correctly ordered release, and the title catches a release whose order
 * differs between catalogues.
 */
export async function fetchAlbumPreviews(album: Album, songs: Song[]): Promise<Record<string, string>> {
  const embedded: Record<string, string> = {};
  for (const song of songs) {
    if (song.streamId) embedded[song.nativeId] = song.streamId;
  }
  if (Object.keys(embedded).length > 0) return embedded;

  const catalogueTracks = await deezer.searchAlbumPreviews(album.artist.name, album.title);
  if (!catalogueTracks.length) return {};

  const byPosition: Record<number, string> = {};
  const byTitle: Record<string, string> = {};
  for (const track of catalogueTracks) {
    if (track.preview) {
      byPosition[track.track_position] = track.preview;
      byTitle[track.title.toLowerCase().trim()] = track.preview;
    }
  }

  const result: Record<string, string> = {};
  songs.forEach((song, index) => {
    const url = byPosition[index + 1] ?? byTitle[song.title.toLowerCase().trim()];
    if (url) result[song.nativeId] = url;
  });
  return result;
}

// --- Similar artists from scrobbles -----------------------------------------

/** Artists similar to one, from what scrobblers play alongside it. */
export async function fetchSimilarArtistsFromScrobbles(
  name: string,
  excludeName: string | undefined,
  limit: number,
  options: { withArtwork?: boolean } = {}
): Promise<Artist[]> {
  const candidates = await getLastFmSimilarArtists(LASTFM_API_KEY, name, limit * 3);
  if (!candidates.length) return [];

  const normalizedExclude = excludeName?.trim().toLowerCase();
  const seen = new Set<string>();
  const provenance = integrationProvenance('lastfm');

  const artists = candidates
    .filter(c => {
      const key = c.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      if (normalizedExclude && key === normalizedExclude) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((c): Artist => {
      // This endpoint names no artist id of its own — its mbid where
      // present, else the artist's name, is all there is to key on.
      const nativeId = c.mbid ?? c.name;
      return {
        localId: makeLocalId('artist', provenance, nativeId),
        nativeId,
        provenance,
        externalIds: c.mbid ? { mbid: c.mbid } : {},
        libraryState: 'external',
        name: c.name,
        cover: { kind: 'none' },
        tags: [],
        albumIds: [],
      };
    });
  // Scrobblers' similar artists carry no pictures of their own.
  return options.withArtwork ? withArtistArtwork(artists) : artists;
}

/** An artist's MusicBrainz id, looked up by name, or null when nothing matches. */
export async function lookupArtistId(name: string): Promise<string | null> {
  const [match] = await searchArtist(name, 1);
  return match?.id ?? null;
}

// --- Playlist recommendations ------------------------------------------------

const PLAYLIST_RECOMMENDATION_COUNT = 8;

/**
 * Tracks to go with a playlist: its artists expanded into similar ones from
 * scrobbles, then a couple of each one's top tracks from the catalogue. A
 * discovery rail rather than a critical path, so no key or no seed artists
 * gives `[]`, not an error.
 */
export async function fetchPlaylistRecommendations(artistNames: string[]): Promise<Song[]> {
  if (!artistNames.length || !SCROBBLES_AVAILABLE) return [];

  try {
    const similarResults = await Promise.all(
      artistNames.map(name => getLastFmSimilarArtists(LASTFM_API_KEY, name, 15))
    );

    const seen = new Set<string>(artistNames.map(n => n.toLowerCase()));
    const candidates: string[] = [];
    for (const similar of similarResults) {
      for (const s of shuffleArray(similar)) {
        if (candidates.length >= artistNames.length * 8) break;
        const key = s.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(s.name);
        }
      }
    }

    const trackGroupResults = await Promise.allSettled(
      shuffleArray(candidates).map(async name => {
        const artist = await deezer.resolveDeezerArtistByName(name);
        if (!artist) return [] as Song[];
        return deezer.getDeezerArtistTopTracks(artist.nativeId, 2);
      })
    );
    const trackGroups = trackGroupResults
      .filter((r): r is PromiseFulfilledResult<Song[]> => r.status === 'fulfilled')
      .map(r => r.value);

    const seenIds = new Set<string>();
    const tracks: Song[] = [];
    const groups = shuffleArray(trackGroups.filter(group => group.length > 0));

    for (let trackIndex = 0; trackIndex < 2; trackIndex++) {
      for (const group of groups) {
        if (tracks.length >= PLAYLIST_RECOMMENDATION_COUNT) break;
        const track = group[trackIndex];
        if (!track) continue;
        if (!seenIds.has(track.nativeId)) {
          seenIds.add(track.nativeId);
          tracks.push(track);
        }
      }
      if (tracks.length >= PLAYLIST_RECOMMENDATION_COUNT) break;
    }

    for (const group of groups) {
      if (tracks.length >= PLAYLIST_RECOMMENDATION_COUNT) break;
      for (const track of group) {
        if (tracks.length >= PLAYLIST_RECOMMENDATION_COUNT) break;
        if (!seenIds.has(track.nativeId)) {
          seenIds.add(track.nativeId);
          tracks.push(track);
        }
      }
    }

    return tracks;
  } catch {
    return [];
  }
}

/** A catalogue album by its catalogue id — for a recommended track the user wants to download. */
export async function fetchCatalogueAlbum(nativeId: string): Promise<Album | null> {
  const detail = await deezer.getDeezerAlbum(nativeId);
  return detail?.album ?? null;
}
