import { createYtFallbackClient, type YtFallbackConfig } from './client';

export type { YtFallbackConfig } from './client';
export { YtFallbackError } from './client';

type TrackRequest = { title: string; artist: string };

/**
 * One job as the service reports it. Field names confirmed against a real
 * live request (search → match → download → organize, verified on disk):
 * `id`, `title`, `artist`, `status` (`queued` | `downloading` | `done` |
 * `error`), `progress` (0-100), `source` (`slskd` | `youtube` — whichever
 * actually served it) and `error` (a message, or null).
 *
 * `source` is carried but not surfaced in `DownloaderQueueItem` — there is
 * nowhere in that shared shape for "which of this downloader's own two paths
 * served it", and Downtify's own `provider` field (the same idea, three-way
 * instead of two) is dropped the same way at its registry boundary.
 */
type YtFallbackJob = {
  id: string;
  title?: string;
  artist?: string;
  status?: string;
  progress?: number;
  source?: string;
  error?: string | null;
  created_at?: number;
};

export interface YtFallbackQueueRecord {
  id: string;
  status: string;
  title: string;
  artist: string;
  progress: number;
  error: string | null;
}

function toRecord(job: YtFallbackJob): YtFallbackQueueRecord {
  return {
    id: String(job.id ?? ''),
    status: String(job.status ?? 'unknown'),
    title: job.title ?? '',
    artist: job.artist ?? '',
    progress: Number(job.progress) || 0,
    error: job.error ?? null,
  };
}

/**
 * `GET /queue`'s own wrapping was never pinned down before this shipped —
 * the one real sample seen while building this was a single job object, not
 * confirmed as a list. Accepts a bare array, a single job object, or a
 * `{ queue: [...] }` / `{ jobs: [...] }` wrapper, so a mismatch here fails
 * soft (an empty queue) rather than throwing on every poll.
 *
 * Narrow this to one shape once a real multi-job response has actually been
 * seen — same situation as the watchlist proxy's lenient field parsing, and
 * the same fix if it turns out wrong: only this function needs to change.
 */
function normalizeQueueResponse(body: unknown): YtFallbackJob[] {
  if (Array.isArray(body)) return body as YtFallbackJob[];
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.queue)) return record.queue as YtFallbackJob[];
    if (Array.isArray(record.jobs)) return record.jobs as YtFallbackJob[];
    if ('id' in record) return [record as YtFallbackJob];
  }
  return [];
}

/**
 * Cheap authenticated read, used to check the address and key are both good.
 * `/health` alone would pass with a wrong or missing key — the service
 * deliberately leaves it unauthenticated for plain reachability checks — so
 * this hits `/queue` instead, which requires the key and costs nothing to
 * read.
 */
export async function testConnection(config: YtFallbackConfig): Promise<boolean> {
  const client = createYtFallbackClient(config);
  await client.request<unknown>('/queue');
  return true;
}

/**
 * Queues one track. The service does its own search-match-download-fallback
 * pipeline behind this single free-text request, the same shape as SoulSync's
 * own endpoint — nothing here needs to know slskd was tried first internally.
 */
export async function downloadTrack(
  config: YtFallbackConfig,
  req: TrackRequest
): Promise<{ id: string }> {
  const client = createYtFallbackClient(config);
  const data = await client.request<{ accepted?: boolean; id?: string }>('/request', {
    method: 'POST',
    body: JSON.stringify({ title: req.title, artist: req.artist }),
  });
  return { id: String(data?.id ?? '') };
}

export async function fetchQueue(config: YtFallbackConfig): Promise<YtFallbackQueueRecord[]> {
  const client = createYtFallbackClient(config);
  const body = await client.request<unknown>('/queue');
  return normalizeQueueResponse(body).map(toRecord).filter(record => record.id);
}

export async function cancelDownload(
  config: YtFallbackConfig,
  record: { id: string }
): Promise<void> {
  const client = createYtFallbackClient(config);
  await client.request(`/queue/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
}
