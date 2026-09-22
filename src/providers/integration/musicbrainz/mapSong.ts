/**
 * MusicBrainz track DTO -> domain Song.
 *
 * `getTracksForReleaseGroup` requests `inc=recordings+artist-credits`
 * specifically so each `MbTrack` carries a `recording` relationship — this
 * adapter does genuinely resolve recordings, not just release track listings,
 * which is what makes a song mapper meaningful here at all.
 *
 * `contentKind` is `'song'`: this adapter never streams or previews audio —
 * it exists purely to resolve metadata and cover art — so there is no
 * MusicBrainz analogue of Deezer's 30-second clip to distinguish against. A
 * resolved recording is a normal domain song, describing the work MusicBrainz
 * knows about rather than anything this adapter can play.
 *
 * No stream URL is produced here, in keeping with every other mapper in this
 * codebase — MusicBrainz never had one to begin with.
 */
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import { albumRef, artistRef } from './mapRefs';
import type { MbRecordingHit, MbReleaseGroup, MbTrack } from './';

/**
 * The id this song is known by at its origin.
 *
 * Prefers the recording id — the MusicBrainz entity that identifies the work
 * itself, independent of any one release — over the track id, which is only
 * a placement of that recording on the specific release this adapter
 * happened to fetch. Falls back to the track id on the rare release that
 * omits the recording relationship, so the song still gets a stable identity.
 */
function nativeIdOf(dto: MbTrack): string {
  return dto.recording?.id ?? dto.id ?? '';
}

function externalIdsOf(dto: MbTrack): ExternalIds {
  const mbid = nativeIdOf(dto);
  return mbid ? { mbid } : {};
}

interface MapSongContext {
  provenance: Provenance;
  /** The release-group this track was resolved from, for its album reference and cover. */
  releaseGroup: MbReleaseGroup;
}

export function mapSong(dto: MbTrack, context: MapSongContext): Song {
  const { provenance, releaseGroup } = context;
  const nativeId = nativeIdOf(dto);
  const album = albumRef(provenance, releaseGroup);

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: externalIdsOf(dto),
    // Resolved through MusicBrainz, not owned on any server — see
    // mapArtist's comment on why this mapper never guesses further.
    title: dto.title ?? 'Unknown',
    artist: artistRef(provenance, dto['artist-credit']),
    album,
    cover: album.cover,
    // MusicBrainz reports track length in milliseconds; the domain wants seconds.
    durationSeconds: dto.length != null ? Math.round(dto.length / 1000) : 0,
    contentKind: 'song',
    trackNumber: dto.position,
    genres: [],
  };
}

/**
 * The release a recording search hit should be shown against: the earliest
 * official one. "Earliest" because that is the album a listener means by
 * "the" release for a song; "official" so a bootleg or promo that happens to
 * carry an earlier date is not preferred over a real release just because it
 * sorts first. Falls back to any release with a release-group when nothing is
 * marked official, rather than showing nothing for a recording MusicBrainz
 * otherwise knows perfectly well.
 */
function bestRelease(dto: MbRecordingHit): NonNullable<MbRecordingHit['releases']>[number] | undefined {
  const releases = (dto.releases ?? []).filter(release => release['release-group']);
  if (releases.length === 0) return undefined;
  const official = releases.filter(release => release.status === 'Official');
  const pool = official.length > 0 ? official : releases;
  return [...pool].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))[0];
}

/**
 * A song search result -> domain `Song`, for the recording search
 * {@link MbTrack}'s sibling mapper.
 *
 * The two DTOs are shaped differently enough (id/title/artist-credit sit at
 * the top level here, not nested under a `recording`, and there is no track
 * `position` to carry) that force-fitting this into {@link mapSong} would
 * cost more than a second small function. Returns `null` when the hit names
 * no release-group at all — MusicBrainz does return recordings with no
 * release attached, and a song search result has nowhere useful to navigate
 * without one, so it is dropped by the caller rather than shown as a dead row.
 */
export function mapRecordingSearchHit(dto: MbRecordingHit, provenance: Provenance): Song | null {
  const release = bestRelease(dto);
  const releaseGroup = release?.['release-group'];
  const nativeId = dto.id;
  if (!releaseGroup || !nativeId) return null;

  const album = albumRef(provenance, releaseGroup);

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: { mbid: nativeId },
    title: dto.title ?? 'Unknown',
    artist: artistRef(provenance, dto['artist-credit']),
    album,
    cover: album.cover,
    durationSeconds: dto.length != null ? Math.round(dto.length / 1000) : 0,
    contentKind: 'song',
    genres: [],
  };
}
