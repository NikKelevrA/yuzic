/**
 * What outside sources put on artist, album and playlist pages — previews,
 * similar artists from scrobbles, playlist recommendations — declared with
 * the other provider declarations, so those pages ask for "previews" or
 * "similar artists" and never name the company answering.
 */
import * as deezer from '@/providers/integration/deezer';
import { getLastFmSimilarArtists } from '@/providers/integration/lastfm/getSimilarArtists';
import { currentMusicbrainzClient } from './musicbrainz';
import { LASTFM_API_KEY } from '@/constants/keys';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import { artistCoverSubject, missingCover } from '@/domain/entities/Cover';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';
import shuffleArray from '@/features/playback/shuffleArray';
import { isSourceAvailable, type SourceUseId } from './sources';

/** The switch each of these reads. */
export const PREVIEWS_USE: SourceUseId = 'deezer.previews';
export const SCROBBLES_SIMILAR_USE: SourceUseId = 'lastfm.similarArtists';
export const CATALOGUE_SIMILAR_USE: SourceUseId = 'deezer.similarArtists';
export const CATALOGUE_TRACKS_RECOMMENDATIONS_USE: SourceUseId = 'deezer.recommendations';
export const ARTIST_ID_LOOKUP_USE: SourceUseId = 'musicbrainz.search';

/**
 * Similar artists from scrobbles need the bundled key; without one there is
 * nothing to ask.
 *
 * Asked of the registry rather than computed again here, so the answer
 * Settings hides a row on is the same answer this refuses a request on.
 */
export const SCROBBLES_AVAILABLE = isSourceAvailable('lastfm');

/**
 * Which sources may answer "who sounds like this", for a caller that has read
 * the switches.
 *
 * The purpose is `similarArtists` — the same question the artist page asks,
 * governed by the same list, rather than a second list asking it again. A
 * playlist knows its artists by name only, which is why ListenBrainz is not
 * here: its similar artists are looked up by MBID, and resolving names to
 * MBIDs is `musicbrainz.search`'s job and a different switch again.
 */
export type SimilarArtistSources = { scrobbles: boolean; catalogue: boolean };

/**
 * Artists like this one, from the first enabled source that answers.
 *
 * Registry order (`SOURCE_USES`), minus ListenBrainz as above. Falling through
 * rather than merging: this is a seed list for the step below, so more names
 * from one source is worth no more than the first source's names, and asking
 * two companies when one has answered is a request nobody needed.
 */
async function similarArtistNames(name: string, sources: SimilarArtistSources): Promise<string[]> {
  if (sources.scrobbles && SCROBBLES_AVAILABLE) {
    const similar = await getLastFmSimilarArtists(LASTFM_API_KEY, name, 15);
    if (similar.length > 0) return similar.map(artist => artist.name);
  }
  if (sources.catalogue) {
    const artist = await deezer.resolveDeezerArtistByName(name);
    if (artist) {
      const related = await deezer.getDeezerRelatedArtists(artist.nativeId, 15);
      if (related.length > 0) return related.map(entry => entry.name);
    }
  }
  return [];
}

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
  limit: number
): Promise<Artist[]> {
  const candidates = await getLastFmSimilarArtists(LASTFM_API_KEY, name, limit * 3);
  if (!candidates.length) return [];

  const normalizedExclude = excludeName?.trim().toLowerCase();
  const seen = new Set<string>();
  const provenance = integrationProvenance('lastfm');

  return candidates
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
        name: c.name,
        // Scrobblers' similar artists carry no pictures of their own; the gap
        // names who each is, for cover resolution to fill.
        cover: missingCover(artistCoverSubject(c.name, c.mbid ? { mbid: c.mbid } : {})),
        tags: [],
        albumIds: [],
      };
    });
}

/** An artist's MusicBrainz id, looked up by name, or null when nothing matches. */
export async function lookupArtistId(name: string): Promise<string | null> {
  const [match] = await currentMusicbrainzClient().searchArtist(name, 1);
  return match?.id ?? null;
}

// --- Playlist recommendations ------------------------------------------------

const PLAYLIST_RECOMMENDATION_COUNT = 8;

/**
 * Tracks to go with a playlist: its artists expanded into similar ones, then a
 * couple of each one's top tracks from the catalogue.
 *
 * Two stages, and they are not the same question. The first is "who sounds
 * like this", which several sources answer and the caller's switches choose
 * between; the second is "what can I play by them", which only a catalogue can
 * answer, so the catalogue is required rather than preferred.
 *
 * It used to name Last.fm for the first stage, which made a rail that Deezer
 * could serve alone depend on a key the build might not carry.
 *
 * A discovery rail rather than a critical path, so nothing enabled or no seed
 * artists gives `[]`, not an error.
 */
export async function fetchPlaylistRecommendations(
  artistNames: string[],
  sources: SimilarArtistSources,
): Promise<Song[]> {
  if (!artistNames.length) return [];

  try {
    const similarResults = await Promise.all(
      artistNames.map(name => similarArtistNames(name, sources))
    );

    const seen = new Set<string>(artistNames.map(n => n.toLowerCase()));
    const candidates: string[] = [];
    for (const similar of similarResults) {
      for (const name of shuffleArray(similar)) {
        if (candidates.length >= artistNames.length * 8) break;
        const key = name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(name);
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
