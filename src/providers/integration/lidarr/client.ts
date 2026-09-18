import { LidarrConfig } from '@/providers/integration/lidarr/config';
import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';

export type LidarrClient = ReturnType<typeof createLidarrClient>;

export function createLidarrClient(config: LidarrConfig) {
  // Trimmed here as well as at the settings field, so a URL or key already
  // stored with a stray newline or space starts working without being re-typed.
  // Untrimmed, the address is unparseable (the request never leaves the device)
  // and the key is rejected with a 401 — neither visible in the input.
  const serverUrl = config.serverUrl?.trim() ?? '';
  const apiKey = config.apiKey?.trim() ?? '';

  if (!serverUrl || !apiKey) {
    throw new Error('Lidarr not configured');
  }

  const baseUrl = `${serverUrl.replace(/\/$/, '')}/api/v1`;

  async function request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetchWithTimeout(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Lidarr API error (${res.status})`);
    }

    // A body is optional, and Lidarr uses that. `DELETE /queue/{id}` answers
    // **200 with an empty body** rather than the 204 this checked for, so the
    // reply fell through to `res.json()` and threw on zero bytes — turning a
    // cancel the server had already carried out into "Couldn't cancel that
    // download", on a row that then disappeared on the next poll anyway. Read
    // the body once and parse it only if there is one, which covers both an
    // empty 200 and a 204 without depending on `content-length` being sent.
    if (res.status === 204) return {} as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  return { request };
}
