import { serverFetch } from '@/features/mtls/serverFetch';
import { probeFailure, type AddressProbe } from '@/providers/server/addressProbe';

/**
 * Whether a Subsonic server answers at `url`, before anyone has signed in.
 *
 * `ping.view` without credentials is refused — but refused inside Subsonic's
 * own `subsonic-response` envelope, which only a Subsonic server sends. The
 * check this replaces fetched the bare address, which any web server answers,
 * and nothing asked it anyway.
 */
export async function probeAddress(url: string): Promise<AddressProbe> {
  let res: Response;
  try {
    res = await serverFetch(`${url.replace(/\/+$/, '')}/rest/ping.view?f=json&v=1.16.0&c=Yuzic`);
  } catch (error) {
    return probeFailure(error);
  }
  // A proxy in front asking for its own sign-in: reachable, and the
  // credentials step asks for it.
  if (res.status === 401 || res.status === 403) return { kind: 'ok' };
  try {
    const body = JSON.parse(await res.text());
    return body?.['subsonic-response'] ? { kind: 'ok' } : { kind: 'notThisServer' };
  } catch {
    return { kind: 'notThisServer' };
  }
}
