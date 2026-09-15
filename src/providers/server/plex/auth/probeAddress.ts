import { serverFetch } from '@/features/mtls/serverFetch';

type Probe = { kind: 'ok' | 'unreachable' | 'notThisServer' };

/**
 * Whether a Plex server answers at `url`, before anyone has signed in.
 * `/identity` is public and carries the server's `machineIdentifier`, which
 * nothing but a Plex Media Server returns.
 */
export async function probeAddress(url: string): Promise<Probe> {
  let res: Response;
  try {
    res = await serverFetch(`${url.replace(/\/+$/, '')}/identity`, { headers: { Accept: 'application/json' } });
  } catch {
    return { kind: 'unreachable' };
  }
  if (res.status === 401 || res.status === 403) return { kind: 'ok' };
  try {
    const body = JSON.parse(await res.text());
    return body?.MediaContainer?.machineIdentifier ? { kind: 'ok' } : { kind: 'notThisServer' };
  } catch {
    return { kind: 'notThisServer' };
  }
}
