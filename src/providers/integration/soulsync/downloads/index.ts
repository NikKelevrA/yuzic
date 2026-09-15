import { createSoulSyncClient, type SoulSyncConfig } from '../client';

type TrackRequest = { title: string; artist: string };

type SoulSyncQueueRecord = {
  id: string;
  status: string;
  title: string;
  artist: string;
  album: string;
  /** Needed to cancel: SoulSync addresses a transfer by id *and* peer. */
  username: string;
  /** 0–100. */
  progress: number;
  sizeBytes: number;
  error: string | null;
};

type RawDownload = {
  id?: string;
  status?: string;
  track_name?: string | null;
  artist_name?: string | null;
  album_name?: string | null;
  username?: string | null;
  progress?: number;
  size?: number | null;
  error?: string | null;
};

/**
 * The query SoulSync matches against. Its request pipeline takes one free-text
 * string — the endpoint's own docs use "Artist - Track Name" — and runs
 * search-match-download over it, so the format matters more than it looks.
 */
export function buildQuery(req: TrackRequest): string {
  const artist = req.artist?.trim();
  const title = req.title?.trim();
  return artist ? `${artist} - ${title}` : title;
}

function toRecord(raw: RawDownload): SoulSyncQueueRecord {
  return {
    id: String(raw.id ?? ''),
    status: String(raw.status ?? 'unknown'),
    title: raw.track_name ?? '',
    artist: raw.artist_name ?? '',
    album: raw.album_name ?? '',
    username: raw.username ?? '',
    progress: Number(raw.progress) || 0,
    sizeBytes: Number(raw.size) || 0,
    error: raw.error ?? null,
  };
}

/** Cheap authenticated read, used to check the URL and key are good. */
export async function testConnection(config: SoulSyncConfig): Promise<boolean> {
  const client = createSoulSyncClient(config);
  await client.request('/downloads?limit=1');
  return true;
}

export async function downloadTrack(
  config: SoulSyncConfig,
  req: TrackRequest
): Promise<{ requestId: string }> {
  const client = createSoulSyncClient(config);
  const data = await client.request<{ request_id?: string }>('/request', {
    method: 'POST',
    body: JSON.stringify({ query: buildQuery(req) }),
  });
  return { requestId: String(data?.request_id ?? '') };
}

export async function fetchQueue(config: SoulSyncConfig): Promise<SoulSyncQueueRecord[]> {
  const client = createSoulSyncClient(config);
  const data = await client.request<{ downloads?: RawDownload[] }>('/downloads?limit=100');
  const rows = Array.isArray(data?.downloads) ? data.downloads : [];
  return rows.map(toRecord).filter(record => record.id);
}

export async function cancelDownload(
  config: SoulSyncConfig,
  record: { id: string; username: string }
): Promise<void> {
  const client = createSoulSyncClient(config);
  await client.request(`/downloads/${encodeURIComponent(record.id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ username: record.username }),
  });
}

