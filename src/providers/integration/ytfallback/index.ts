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

type ResolveRequest = { title: string; artist: string; mbid?: string; isrc?: string };

/**
 * "Do you have this, or go get it" — one idempotent call replacing the whole
 * client-side dance this used to require: pick a downloader, send it a Get,
 * separately ask the server to scan, separately force a library resync, and
 * poll the *app's own* sync state hoping it eventually agrees the track
 * landed. That dance is exactly what produced the bugs worth naming: two
 * independent Gets racing for the same file because nothing server-side
 * deduplicated them, and an app-side sync that could lag or never run at all
 * behind what the server already knew. `/resolve` moves ownership of "do we
 * have this / are we already getting this / here it is" entirely onto the
 * service that can actually answer authoritatively — see
 * `resolver-endpoint-spec.md` for the full contract this was built against.
 *
 * Safe to call repeatedly with the same (title, artist): already resolved
 * returns `ready` again; already in flight returns the *same* job rather
 * than starting a second one.
 */
export type ResolveResult =
  | { status: 'ready'; songId: string }
  | { status: 'pending'; jobId: string; progress: number }
  | { status: 'failed'; reason: string };

function normalizeResolveResponse(body: unknown): ResolveResult {
  const record = (body && typeof body === 'object') ? body as Record<string, unknown> : {};
  const status = String(record.status ?? '');
  if (status === 'ready') {
    return { status: 'ready', songId: String(record.songId ?? record.song_id ?? record.id ?? '') };
  }
  if (status === 'pending') {
    return {
      status: 'pending',
      jobId: String(record.jobId ?? record.job_id ?? record.id ?? ''),
      progress: Number(record.progress) || 0,
    };
  }
  return { status: 'failed', reason: String(record.reason ?? record.error ?? 'unknown') };
}

export async function resolve(config: YtFallbackConfig, req: ResolveRequest): Promise<ResolveResult> {
  const client = createYtFallbackClient(config);
  const body = await client.request<unknown>('/resolve', {
    method: 'POST',
    body: JSON.stringify({
      title: req.title,
      artist: req.artist,
      ...(req.mbid ? { mbid: req.mbid } : {}),
      ...(req.isrc ? { isrc: req.isrc } : {}),
    }),
  });
  return normalizeResolveResponse(body);
}
