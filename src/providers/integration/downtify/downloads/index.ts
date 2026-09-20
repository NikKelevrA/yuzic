import { createDowntifyClient, type DowntifyConfig } from '../client';

type TrackRequest = { title: string; artist: string };

/**
 * One of Downtify's search results, and the thing its batch endpoint takes
 * back.
 *
 * Deliberately opaque past the two fields below. Downtify's documented schema
 * names `source`, `artist`, `title` and the optional `track_number`,
 * `album_track_total`, `youtube_id` and `downtify_playlist_url`, and says
 * these "survive the re-fetch by URL" — but it does not publish a complete
 * field list. So a result is carried back to `/api/download/batch` exactly as
 * it arrived, and only what is documented is ever read. Rebuilding the object
 * from fields we think we know would drop whatever we do not.
 */
type DowntifySong = {
  title?: string;
  artist?: string;
  /** Not documented, but what a job is addressed by — see `queueItemId`. */
  id?: string;
  youtube_id?: string;
  [field: string]: unknown;
};

type DowntifyJob = {
  song?: DowntifySong;
  status?: string;
  progress?: number;
  message?: string;
  filename?: string;
  /** Which source served it: `youtube-music`, `youtube` or `slskd`. */
  provider?: string;
};

type DowntifyQueueRecord = {
  id: string;
  /** `queued` | `downloading` | `done` | `error`, per Downtify's own set. */
  status: string;
  title: string;
  artist: string;
  /** 0–100. */
  progress: number;
  provider: string;
  message: string;
};

/**
 * How a queue row is addressed for cancellation.
 *
 * `DELETE /api/queue/item` takes a `song_id`, and `POST /api/download/batch`
 * answers with `job_ids`, so the two are the same identifier — but Downtify's
 * reference does not say which field of a song carries it. `id` is the
 * reading that matches those two names; `youtube_id` is the documented field
 * most likely to stand in where `id` is absent. A row with neither is dropped
 * rather than shown as something that cannot be cancelled.
 */
function queueItemId(song: DowntifySong | undefined): string {
  return String(song?.id ?? song?.youtube_id ?? '');
}

function toRecord(job: DowntifyJob): DowntifyQueueRecord {
  return {
    id: queueItemId(job.song),
    status: String(job.status ?? 'unknown'),
    title: job.song?.title ?? '',
    artist: job.song?.artist ?? '',
    progress: Number(job.progress) || 0,
    provider: String(job.provider ?? ''),
    message: String(job.message ?? ''),
  };
}

/** The query Downtify's YouTube Music search is given. */
export function buildQuery(req: TrackRequest): string {
  const artist = req.artist?.trim();
  const title = req.title?.trim();
  return artist ? `${artist} - ${title}` : title;
}

/** Cheap unauthenticated read, used to check the address points at a Downtify. */
export async function testConnection(config: DowntifyConfig): Promise<boolean> {
  const client = createDowntifyClient(config);
  const version = await client.requestText('/api/version');
  // A bare version string is what Downtify answers with. Anything else — a
  // reverse proxy's HTML, a different service — is not one.
  return typeof version === 'string' && version.trim().length > 0;
}

async function searchSongs(
  config: DowntifyConfig,
  query: string
): Promise<DowntifySong[]> {
  const client = createDowntifyClient(config);
  const results = await client.request<DowntifySong[]>(
    `/api/songs/search?query=${encodeURIComponent(query)}`
  );
  return Array.isArray(results) ? results : [];
}

/**
 * Queues one track.
 *
 * Two calls rather than one, because Downtify's download endpoints take a URL
 * or a song object and never a free-text query the way SoulSync's does: the
 * search resolves the track first, and its top result is handed back
 * unmodified.
 *
 * `/api/download/batch` rather than `/api/download/url`, even for a single
 * track: the `url` endpoint blocks until the download finishes, which would
 * hold a request open for minutes and give the app nothing to show meanwhile.
 * `batch` answers immediately with `job_ids`, and the queue reports the rest.
 */
export async function downloadTrack(
  config: DowntifyConfig,
  req: TrackRequest
): Promise<{ jobIds: string[] }> {
  const results = await searchSongs(config, buildQuery(req));
  const best = results[0];
  if (!best) {
    throw new Error(`Downtify found nothing for ${buildQuery(req)}`);
  }

  const client = createDowntifyClient(config);
  const data = await client.request<{ job_ids?: string[]; count?: number }>(
    '/api/download/batch',
    {
      method: 'POST',
      // Only `songs`. `playlist_url` and `generate_m3u` belong to a playlist
      // download; one track from a Get is not one, and asking for an M3U here
      // would litter the library with single-track playlists.
      body: JSON.stringify({ songs: [best] }),
    }
  );

  return { jobIds: (data?.job_ids ?? []).map(String) };
}

export async function fetchQueue(config: DowntifyConfig): Promise<DowntifyQueueRecord[]> {
  const client = createDowntifyClient(config);
  const jobs = await client.request<DowntifyJob[]>('/api/queue');
  const rows = Array.isArray(jobs) ? jobs : [];
  return rows.map(toRecord).filter(record => record.id);
}

export async function cancelDownload(
  config: DowntifyConfig,
  record: { id: string }
): Promise<void> {
  const client = createDowntifyClient(config);
  await client.request(`/api/queue/item?song_id=${encodeURIComponent(record.id)}`, {
    method: 'DELETE',
  });
}
