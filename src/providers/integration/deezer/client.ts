import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import { createRateLimiter } from '@/providers/http/rateLimit';

const BASE_URL = 'https://api.deezer.com';

/**
 * Deezer's published limit is 50 requests per 5 seconds per client. Spacing
 * calls at that average keeps a burst of search keystrokes inside it.
 */
const DEEZER_MIN_INTERVAL_MS = 100;
const limit = createRateLimiter(DEEZER_MIN_INTERVAL_MS);

/** A request Deezer answered and refused — an `error` object in a 200 body. */
export class DeezerApiError extends Error {
  constructor(readonly code: number | undefined, message: string | undefined) {
    super(message ?? `Deezer API error${code !== undefined ? ` (${code})` : ''}`);
    this.name = 'DeezerApiError';
  }
}

type DeezerErrorBody = { error?: { code?: number; message?: string } };

async function request<T>(path: string): Promise<T> {
  return limit(async () => {
    const res = await fetchWithTimeout(`${BASE_URL}${path}`);
    if (!res.ok) throw new Error(`Deezer API error (${res.status})`);
    const body = (await res.json()) as T & DeezerErrorBody;
    // Over quota (code 4) and bad parameters both arrive as 200 OK. Returned
    // as data they read as "nothing found", and the callers cache that.
    if (body && typeof body === 'object' && body.error) {
      throw new DeezerApiError(body.error.code, body.error.message);
    }
    return body as T;
  });
}

export const deezerClient = { request };
