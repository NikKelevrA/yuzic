import { createLidarrClient, type LidarrClient } from '../client';
import { ensureArtist, getArtists, lookupArtist } from '../artists';
import type { LidarrConfig } from '@/providers/integration/lidarr/config';
import {
  cleanId,
  normalize,
  releaseYear,
  resolveAlbumCandidate,
  resolveArtistCandidate,
  type AlbumResolution,
  type ArtistResolution,
  type LidarrAlbum,
  type LidarrAlbumRequest,
} from './resolution';

/**
 * Requesting an album from Lidarr: find or add its artist, wait for Lidarr to
 * know the album, monitor just that release, and start a search for it. Which
 * artist and album a request means is decided in `resolution.ts`.
 */

type LidarrAlbumErrorCode =
  | 'missing_album_identity'
  | 'artist_identity_unresolved'
  | 'artist_identity_ambiguous'
  | 'external_identity_mismatch'
  | 'album_not_found_for_artist'
  | 'album_identity_ambiguous'
  | 'lidarr_metadata_unavailable'
  | 'request_timeout';

type AlbumSearchResult =
  | {
      success: true;
      status: 'submitted' | 'already_processing' | 'already_available';
      message?: string;
    }
  | {
      success: false;
      code: LidarrAlbumErrorCode;
      message: string;
    };

type DownloadOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  /**
   * Overrides the quality profile Lidarr assigns when it has to create the
   * artist for this request. Only matters the first time an artist is added
   * — an already-existing artist keeps whatever profile it already has.
   * Omit to keep today's default (Lidarr profile id 1).
   */
  qualityProfileId?: number;
};

type LidarrCommand = {
  name?: string;
  status?: string;
  albumIds?: number[];
  body?: {
    albumIds?: number[];
  };
};

const pendingRequests = new Map<string, Promise<AlbumSearchResult>>();

const errorMessages: Record<LidarrAlbumErrorCode, string> = {
  missing_album_identity: 'Missing album or artist identity',
  artist_identity_unresolved: 'Artist identity could not be resolved',
  artist_identity_ambiguous: 'Artist identity is ambiguous',
  external_identity_mismatch: 'External artist identities disagree',
  album_not_found_for_artist: 'Album not found for the resolved artist',
  album_identity_ambiguous: 'Album identity is ambiguous',
  lidarr_metadata_unavailable: 'Lidarr metadata is unavailable',
  request_timeout: 'Timed out while waiting for Lidarr metadata',
};

function failure(code: LidarrAlbumErrorCode): AlbumSearchResult {
  return {
    success: false,
    code,
    message: errorMessages[code],
  };
}

async function getAlbumsByArtist(client: LidarrClient, artistId: number) {
  return client.request<LidarrAlbum[]>(`/album?artistId=${artistId}`);
}

async function lookupResolvedArtist(
  client: LidarrClient,
  request: LidarrAlbumRequest
): Promise<ArtistResolution> {
  const localArtists = await getArtists(client);
  const localResolution = resolveArtistCandidate(localArtists, request);
  if (localResolution.ok) return localResolution;

  const byName = await lookupArtist(client, request.artistName);
  let candidates = byName;
  if (request.artistMbid) {
    try {
      const byMbid = await lookupArtist(client, `lidarr:${request.artistMbid}`);
      const seen = new Set(byName.map(artist => artist.foreignArtistId));
      candidates = [
        ...byName,
        ...byMbid.filter(artist => !seen.has(artist.foreignArtistId)),
      ];
    } catch {
      // Lidarr may reject the mbid-scoped lookup term. Fall back to the name
      // candidates rather than failing a request the name lookup can resolve.
    }
  }
  return resolveArtistCandidate(candidates, request);
}

async function waitForAlbum(
  client: LidarrClient,
  artistId: number,
  request: LidarrAlbumRequest,
  {
    timeoutMs = 90_000,
    pollIntervalMs = 2_500,
    signal,
  }: DownloadOptions
): Promise<AlbumResolution | { ok: false; code: 'request_timeout' }> {
  const started = Date.now();
  let lastResolution: AlbumResolution | null = null;

  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) {
      return { ok: false, code: 'request_timeout' };
    }

    const albums = await getAlbumsByArtist(client, artistId);
    const resolution = resolveAlbumCandidate(albums, request);
    if (resolution.ok || resolution.code === 'album_identity_ambiguous') {
      return resolution;
    }
    lastResolution = resolution;

    await delay(pollIntervalMs, signal);
  }

  // Prefer the specific "not found" outcome from the last completed read over a
  // generic timeout, so the user learns the album is absent from Lidarr rather
  // than assuming a transient stall. Fall back to timeout only if no read landed.
  return lastResolution ?? { ok: false, code: 'request_timeout' };
}

async function monitorAlbum(client: LidarrClient, album: LidarrAlbum) {
  if (album.monitored) return album;
  return client.request<LidarrAlbum>(`/album/${album.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...album,
      monitored: true,
    }),
  });
}

function commandAlbumIds(command: LidarrCommand) {
  return command.albumIds ?? command.body?.albumIds ?? [];
}

async function hasActiveAlbumSearch(
  client: LidarrClient,
  albumId: number
) {
  const commands = await client.request<LidarrCommand[]>('/command');
  return commands.some(command => {
    const status = command.status?.toLowerCase();
    return (
      command.name?.toLowerCase() === 'albumsearch' &&
      (status === 'queued' || status === 'started') &&
      commandAlbumIds(command).includes(albumId)
    );
  });
}

async function triggerAlbumSearch(client: LidarrClient, albumId: number) {
  if (await hasActiveAlbumSearch(client, albumId)) return false;

  await client.request('/command', {
    method: 'POST',
    body: JSON.stringify({
      name: 'AlbumSearch',
      albumIds: [albumId],
    }),
  });
  return true;
}

function isAlbumAvailable(album: LidarrAlbum) {
  const statistics = album.statistics;
  if (!statistics) return false;
  if ((statistics.percentOfTracks ?? 0) >= 100) return true;
  return (
    (statistics.totalTrackCount ?? 0) > 0 &&
    statistics.trackFileCount === statistics.totalTrackCount
  );
}

function requestKey(config: LidarrConfig, request: LidarrAlbumRequest) {
  const artist =
    cleanId(request.artistMbid) ??
    cleanId(request.artistDeezerId) ??
    normalize(request.artistName);
  const album =
    cleanId(request.albumMbid) ??
    cleanId(request.albumDeezerId) ??
    `${normalize(request.albumTitle)}:${releaseYear(request.releaseDate) ?? ''}`;
  // Scope by server so identical album identities on different Lidarr
  // instances are not coalesced into one shared in-flight request.
  return `${cleanId(config.serverUrl) ?? ''}:${artist}:${album}`;
}

async function performDownload(
  config: LidarrConfig,
  request: LidarrAlbumRequest,
  options: DownloadOptions
): Promise<AlbumSearchResult> {
  if (!request.albumTitle?.trim() || !request.artistName?.trim()) {
    return failure('missing_album_identity');
  }

  try {
    const client = createLidarrClient(config);
    const artistResolution = await lookupResolvedArtist(client, request);
    if (!artistResolution.ok) return failure(artistResolution.code);

    const ensured = await ensureArtist(client, artistResolution.artist, {
      monitored: false,
      searchForMissingAlbums: false,
      // Do not let Lidarr flag every album on a freshly added artist as
      // monitored — the user only asked for this one. monitorAlbum() below
      // then enables monitoring on just the target release (issue #176).
      monitor: 'none',
      qualityProfileId: options.qualityProfileId,
    });
    if (!ensured.success) return failure('lidarr_metadata_unavailable');

    const albumResolution = await waitForAlbum(client, ensured.artistId, request, {
      ...options,
      // A pre-existing artist already has its album list, so a missing album
      // won't appear by waiting; only a freshly created artist needs time for
      // Lidarr to populate metadata.
      timeoutMs: options.timeoutMs ?? (ensured.created ? 90_000 : 10_000),
    });
    if (!albumResolution.ok) return failure(albumResolution.code);

    if (isAlbumAvailable(albumResolution.album)) {
      return {
        success: true,
        status: 'already_available',
        message: 'Album is already available',
      };
    }

    const album = await monitorAlbum(client, albumResolution.album);
    const submitted = await triggerAlbumSearch(client, album.id);
    return submitted
      ? { success: true, status: 'submitted' }
      : {
          success: true,
          status: 'already_processing',
          message: 'Album request is already processing',
        };
  } catch {
    return failure(
      options.signal?.aborted
        ? 'request_timeout'
        : 'lidarr_metadata_unavailable'
    );
  }
}

export function downloadAlbum(
  config: LidarrConfig,
  request: LidarrAlbumRequest,
  options: DownloadOptions = {}
): Promise<AlbumSearchResult> {
  const key = requestKey(config, request);
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const operation = performDownload(config, request, options).finally(() => {
    if (pendingRequests.get(key) === operation) pendingRequests.delete(key);
  });
  pendingRequests.set(key, operation);
  return operation;
}

function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
