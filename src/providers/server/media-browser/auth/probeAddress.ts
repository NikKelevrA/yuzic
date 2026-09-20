import type { MediaBrowserBrand } from '../brand';
import { serverFetch } from '@/features/mtls/serverFetch';
import { probeFailure, type AddressProbe } from '@/providers/server/addressProbe';

/**
 * Whether a Jellyfin or Emby server of `brand` answers at `url`, before
 * anyone has signed in.
 *
 * `/System/Info/Public` needs no sign-in and names the product — "Jellyfin
 * Server", "Emby Server" — so a Jellyfin address typed under Emby is caught
 * here, where it used to fail at sign-in looking like a wrong password.
 */
export async function probeAddress(brand: MediaBrowserBrand, url: string): Promise<AddressProbe> {
  let res: Response;
  try {
    res = await serverFetch(`${url.replace(/\/+$/, '')}/System/Info/Public`);
  } catch (error) {
    return probeFailure(error);
  }
  if (res.status === 401 || res.status === 403) return { kind: 'ok' };
  try {
    const info = JSON.parse(await res.text()) as { Id?: string; ProductName?: string };
    if (!info?.Id && !info?.ProductName) return { kind: 'notThisServer' };
    if (info.ProductName && !info.ProductName.toLowerCase().includes(brand.label.toLowerCase())) {
      return { kind: 'notThisServer' };
    }
    return { kind: 'ok' };
  } catch {
    return { kind: 'notThisServer' };
  }
}
