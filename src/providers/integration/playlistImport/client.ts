import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';

/**
 * The NAS "Last.fm popularity watchlist" proxy — a LAN-only Flask-style tool
 * (see `playlist-import-feature-brief.md`), not a public API. There is no key
 * or token: reachability on the home network is the only access control it
 * has, same trust boundary as the rest of this app's self-hosted stack.
 */
export interface PlaylistImportConfig {
  serverUrl: string;
}

export type PlaylistImportClient = ReturnType<typeof createPlaylistImportClient>;

export function createPlaylistImportClient(config: PlaylistImportConfig) {
  const { serverUrl } = config;

  if (!serverUrl) {
    throw new Error('Playlist import watchlist not configured');
  }

  const baseUrl = serverUrl.replace(/\/$/, '');

  async function request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetchWithTimeout(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Playlist import watchlist error (${res.status}): ${text}`);
    }

    return res.json();
  }

  return { request, baseUrl };
}
