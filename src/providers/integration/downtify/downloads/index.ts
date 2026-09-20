import { createDowntifyClient, type DowntifyConfig } from '../client';

type TrackRequest = { title: string; artist: string };

/**
 * One of Downtify's search results, and the thing its batch endpoint takes
 * back.
 *
 * Read off a live Downtify 3.0.0, because its published reference does not
 * carry the schema and the field names are not the ones the prose implies:
 * a result is `song_id` / `name` / `artists` (an array), not `id` / `title` /
 * `artist`. The rest — `album_name`, `cover_url`, `duration`, `url`,
 * `source`, `spotify_url`, `explicit`, `year`, `release_date` — is carried
 * but unread.
 *
 * Still indexed, and still passed back to `/api/download/batch` exactly as it
 * arrived rather than rebuilt: the endpoint takes the whole object, and a
 * version that adds a field would lose it the moment this side started
 * copying fields across by name.
 */
type DowntifySong = {
  /** What a job is addressed by: `job_ids` and `song_id` are the same value. */
  song_id?: string;
  name?: string;
  artists?: string[];
  album_name?: string;
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
  album: string;
  /** 0–100. */
  progress: number;
  /** Which source served it, once one has: `youtube-music`, `youtube`, `slskd`. */
  provider: string;
  message: string;
};

/**
 * How a queue row is addressed for cancellation.
 *
 * `DELETE /api/queue/item` takes a `song_id` and `POST /api/download/batch`
 * answers with `job_ids`; against a live server those are the same value, and
 * it is the song's `song_id`. A row without one is dropped rather than shown
 * as something that cannot be cancelled.
 */
function queueItemId(song: DowntifySong | undefined): string {
  return String(song?.song_id ?? '');
}

function toRecord(job: DowntifyJob): DowntifyQueueRecord {
  return {
    id: queueItemId(job.song),
    status: String(job.status ?? 'unknown'),
    title: job.song?.name ?? '',
    // An array, and Downtify fills it with one name for a YouTube Music
    // match. Joined rather than indexed so a collaboration reads as one.
    artist: (job.song?.artists ?? []).join(', '),
    album: job.song?.album_name ?? '',
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
  const version = await client.request<string>('/api/version');
  // A JSON string — `"3.0.0"` on the wire — is what Downtify answers with.
  // Anything else (a reverse proxy's HTML, a different service) is not one.
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
