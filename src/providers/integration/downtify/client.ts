import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';

/**
 * Where Downtify is. There is no second field.
 *
 * Downtify's API has no authentication of any kind — no key, no token, no
 * basic auth — so it is the first downloader here that holds no credential.
 * That is Downtify's design rather than an omission on this side, and it is
 * worth knowing when you expose it: anything that can reach the port can
 * queue downloads on it. The settings screen says so.
 */
export interface DowntifyConfig {
  serverUrl: string;
}

/** Carries the status so callers can tell "not running" from "refused". */
export class DowntifyError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'DowntifyError';
    this.status = status;
  }
}

export function createDowntifyClient(config: DowntifyConfig) {
  // Trimmed for the same reason as the Lidarr and SoulSync clients: an address
  // stored with invisible whitespace should work without being re-entered.
  const serverUrl = config.serverUrl?.trim() ?? '';
  if (!serverUrl) throw new Error('Downtify not configured');

  const baseUrl = serverUrl.replace(/\/+$/, '');

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetchWithTimeout(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });

    const body = await res.text();

    if (!res.ok) {
      throw new DowntifyError(`Downtify API error (${res.status})`, res.status);
    }

    // An empty body is a legitimate answer from the DELETEs.
    if (!body) return {} as T;
    return JSON.parse(body) as T;
  }

  /**
   * The body as text.
   *
   * `/api/version` answers with a bare version string rather than JSON, which
   * `request` cannot return without casting a string to its caller's type.
   * A second method is the honest way to say "this one is not JSON".
   */
  async function requestText(path: string): Promise<string> {
    const res = await fetchWithTimeout(`${baseUrl}${path}`, {
      headers: { Accept: 'text/plain, application/json' },
    });
    if (!res.ok) {
      throw new DowntifyError(`Downtify API error (${res.status})`, res.status);
    }
    return res.text();
  }

  return { request, requestText, baseUrl };
}
