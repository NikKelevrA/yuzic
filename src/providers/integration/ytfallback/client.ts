import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';

/**
 * The self-hosted slskd-then-YouTube fallback service — what a Get reaches
 * for once slskd/Soulseek itself has already come up empty. Built to replace
 * SoulSync (see `nas-prompt-youtube-fallback-service.md`): it tries slskd's
 * own API first and only falls back to YouTube search+download if that finds
 * nothing, all server-side, so nothing on this side has to know there are two
 * paths inside it.
 *
 * A shared API key over `Authorization: Bearer` — the same header convention
 * as the SoulSync client this one was modeled on directly.
 */
export interface YtFallbackConfig {
  serverUrl: string;
  apiKey: string;
}

/** Carries the status so callers can tell "not running" from "refused". */
export class YtFallbackError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'YtFallbackError';
    this.status = status;
  }
}

export function createYtFallbackClient(config: YtFallbackConfig) {
  // See the same note in the Lidarr/SoulSync/slskd clients: trimmed so an
  // address or key stored with invisible whitespace works without being
  // re-entered.
  const serverUrl = config.serverUrl?.trim() ?? '';
  const apiKey = config.apiKey?.trim() ?? '';

  if (!serverUrl || !apiKey) {
    throw new Error('YT Fallback not configured');
  }

  const baseUrl = serverUrl.replace(/\/+$/, '');

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetchWithTimeout(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${apiKey}`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });

    const body = await res.text();

    if (!res.ok) {
      throw new YtFallbackError(`YT Fallback API error (${res.status})`, res.status);
    }

    // DELETE and other no-content replies have no body to parse.
    if (!body) return {} as T;
    return JSON.parse(body) as T;
  }

  return { request, baseUrl };
}
