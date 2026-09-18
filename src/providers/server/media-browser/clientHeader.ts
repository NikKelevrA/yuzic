import { getInstallationId } from '@/providers/server/installationId';
import type { MediaBrowserBrand } from './brand';

/**
 * The credentials value MediaBrowser servers expect, whichever header carries
 * it.
 *
 * Built per call rather than held in a module constant because `DeviceId` is
 * read from storage — see `installationId.ts` for why it must be a real
 * per-install value and not the shared literal this used to be.
 */
export function mediaBrowserClientHeader(): string {
  return `MediaBrowser Client="Yuzic", Device="Mobile", DeviceId="${getInstallationId()}", Version="1.0.0"`;
}

/**
 * The headers that identify this client, and optionally authenticate it.
 *
 * **Why this is not just `X-Emby-Authorization` any more.** Jellyfin 12 reads
 * the standard `Authorization` header, and only falls back to
 * `X-Emby-Authorization` when `EnableLegacyAuthorization` is set — a setting
 * that defaults to false *and* that 12 ships a migration to turn off on every
 * upgrade. So on an upgraded server every header this app sent was ignored:
 * the client name never arrived, and `AuthenticateByName` threw
 * `Value cannot be null. (Parameter 'request.App')` before it ever looked at
 * the password. That is the login failure, and it was never a credentials
 * problem.
 *
 * The same switch also gates the `X-Emby-Token` and `X-MediaBrowser-Token`
 * headers, so this is not only about signing in: once past the door, every
 * authenticated request would have failed the same way.
 *
 * Both headers are sent where the brand allows it. A server that reads
 * `Authorization` never looks at the legacy one, and a server too old to know
 * the standard form still finds what it wants — so one build serves both
 * without asking anybody which version they run.
 *
 * `basicAuth` is the exception, and an unavoidable one: a reverse proxy
 * demanding HTTP basic auth occupies `Authorization`, and there is only one of
 * it. Those installs fall back to the legacy header alone, which on Jellyfin
 * 12 means the server must have `EnableLegacyAuthorization` switched back on.
 * There is no header we can send that satisfies both at once.
 */
export function mediaBrowserAuthHeaders(
  brand: MediaBrowserBrand,
  options: { token?: string; basicAuth?: { username: string; password?: string } } = {},
): Record<string, string> {
  const { token, basicAuth } = options;
  const credentials = token
    ? `${mediaBrowserClientHeader()}, Token="${token}"`
    : mediaBrowserClientHeader();

  const headers: Record<string, string> = {
    // Always sent. Harmless where it is ignored, and the only thing an older
    // server or an Emby install will read.
    'X-Emby-Authorization': credentials,
  };

  // Legacy, and gated behind the same switch on Jellyfin 12 — kept because it
  // costs nothing and is what an older server reaches for first.
  if (token) headers['X-Emby-Token'] = token;

  if (basicAuth) {
    headers.Authorization =
      'Basic ' + btoa(`${basicAuth.username}:${basicAuth.password ?? ''}`);
    return headers;
  }

  if (brand.usesStandardAuthHeader) headers.Authorization = credentials;
  return headers;
}
