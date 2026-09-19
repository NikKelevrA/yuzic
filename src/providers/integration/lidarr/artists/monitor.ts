/**
 * Putting an artist under Lidarr's watch — what an *artist* want's Get means.
 *
 * Its own module rather than a function in `./index`, because deciding which
 * Lidarr artist a name means lives in `../albums/resolution`, and that module
 * already reads its artist types back from `./index`. Adding the import the
 * other way round closed the loop into an import cycle; this file sits below
 * both instead and imports from each.
 *
 * Reusing that resolution is the point. "Kanye West" has to land on the same
 * Lidarr artist whether it arrives as an album request or as a followed
 * artist, and a second, looser name match written here is exactly how those
 * two answers drift apart.
 */
import type { LidarrClient } from '../client';
import { resolveArtistCandidate, type LidarrAlbumRequest } from '../albums/resolution';
import {
  ensureArtist,
  getArtists,
  lookupArtist,
  triggerArtistSearch,
  type LidarrMonitorPolicy,
} from './index';

export type MonitorArtistRequest = {
  name: string;
  mbid?: string;
  /**
   * Which of the artist's albums Lidarr watches, applied when it first adds
   * them. Defaults to `future` — see the note on the function below.
   */
  monitor?: LidarrMonitorPolicy;
  /** Ask Lidarr to go looking for what it is now watching. */
  search?: boolean;
  qualityProfileId?: number;
};

type MonitorArtistResult =
  | { success: true; artistId: number; created: boolean; searchStarted: boolean }
  | { success: false; code: string; message: string };

/**
 * Follow an artist, adding them to Lidarr if it has never heard of them.
 *
 * `monitor` defaults to `future` and the search to off, which is what this
 * did unconditionally before: Get on an artist is a request to *follow* them,
 * not a demand for their back catalogue, and a Lidarr that went looking for
 * every album an artist ever released would turn one tap into hundreds of
 * downloads nobody asked for.
 *
 * They are arguments now because the review sheet asks. That is the same trade
 * the album Get already makes — the danger was never the search, it was a
 * search nobody agreed to, and a sheet that names the policy is agreement.
 *
 * The two settings are one decision in two halves: `ArtistSearch` looks for
 * albums that are *monitored and missing*, so under `future` there is nothing
 * yet to find and the search is a no-op rather than a failure. Asking for the
 * back catalogue means saying so in `monitor`.
 */
export async function monitorArtist(
  client: LidarrClient,
  request: MonitorArtistRequest
): Promise<MonitorArtistResult> {
  const term = request.name?.trim();
  if (!term) {
    return { success: false, code: 'missing_album_identity', message: 'Missing artist name' };
  }

  // An album request's shape, carrying only the artist half — which is all
  // `resolveArtistCandidate` reads.
  const asRequest: LidarrAlbumRequest = {
    albumTitle: '',
    artistName: term,
    artistMbid: request.mbid ?? null,
  };

  // Artists Lidarr already holds first, same order an album request uses: one
  // it has is resolved without a metadata lookup at all.
  let resolution = resolveArtistCandidate(await getArtists(client), asRequest);
  if (!resolution.ok) {
    resolution = resolveArtistCandidate(await lookupArtist(client, term), asRequest);
  }
  if (!resolution.ok) {
    return { success: false, code: resolution.code, message: `Artist could not be resolved: ${resolution.code}` };
  }

  const ensured = await ensureArtist(client, resolution.artist, {
    monitored: true,
    // Lidarr's own add-time search, for an artist it is meeting for the first
    // time. It covers exactly the albums `monitor` just flagged, which is why
    // the explicit command below is only needed for one it already had.
    searchForMissingAlbums: request.search === true,
    monitor: request.monitor ?? 'future',
    qualityProfileId: request.qualityProfileId,
  });
  if (!ensured.success) {
    return { success: false, code: 'lidarr_metadata_unavailable', message: ensured.message };
  }

  // A freshly added artist has already been searched by `addOptions` above;
  // asking again would queue a second sweep of the same albums.
  const needsCommand = request.search === true && !ensured.created;
  const searchStarted = needsCommand
    ? await triggerArtistSearch(client, ensured.artistId).catch(() => false)
    : request.search === true;

  return { ...ensured, searchStarted };
}
