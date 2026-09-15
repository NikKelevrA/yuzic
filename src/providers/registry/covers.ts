/**
 * How each kind of cover becomes an image URL and a cache key — the outside
 * archives' URL shapes and each server's key layout — declared with the
 * providers, so image code asks for "the cover" and never names who serves it.
 */
import { COVER_PX, CoverSource } from '@/domain/entities/Cover';
import store from '@/state/redux/store';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { SERVER_PROVIDERS } from './serverConnections';
import { withServerCredentials } from './serverCredentials';
import { normalizeImageUrlForSize } from '@/features/artwork/normalizeImageUrl';
import { resolveCoverNow } from '@/features/artwork/coverResolution';

function buildCoverArtArchiveUrl(
  mbid: string,
  mbidType: 'release' | 'release-group',
  size: 'thumb' | 'grid' | 'detail' | 'background'
): string | null {
  if (!mbid) return null

  // CAA only guarantees 250 and 500 thumbnails for release-group covers.
  // 1200 is only generated for large originals and 404s otherwise.
  const mbSize = COVER_PX[size] <= 250 ? 250 : 500
  const endpoint = mbidType === 'release' ? 'release' : 'release-group'

  return `https://coverartarchive.org/${endpoint}/${mbid}/front-${mbSize}`
}

export function buildCoverCacheKey(
  source: CoverSource,
  size: 'thumb' | 'grid' | 'detail' | 'background'
): string | null {
  const px = COVER_PX[size];
  // A gap is filled from the library or a remembered backup before anything
  // is built, so every surface that asks for a URL gets the same picture.
  const cover = source ? resolveCoverNow(source).cover : source;

  if (!cover || cover.kind === 'none' || cover.kind === 'special') return null;

  if (cover.kind === 'url') return `url:${cover.url}:${px}`;
  if (cover.kind === 'coverartarchive') return `coverartarchive:${cover.mbid}:${cover.mbidType}:${px}`;

  const state = store.getState();
  const active = selectActiveServer(state);
  if (!active) return null;

  if (cover.kind === 'navidrome') return `navidrome:${active.id}:${cover.coverArtId}:${px}`;
  if (cover.kind === 'jellyfin') return `jellyfin:${active.id}:${cover.itemId}:${px}`;
  if (cover.kind === 'emby') return `emby:${active.id}:${cover.itemId}:${cover.tag ?? ''}:${px}`;

  return null;
}

export function buildCover(
  source: CoverSource,
  size: 'thumb' | 'grid' | 'detail' | 'background'
): string | null {
  const px = COVER_PX[size];
  const cover = source ? resolveCoverNow(source).cover : source;

  if (!cover || cover.kind === 'none') return null;

  if (cover.kind === 'special' && cover.name === 'heart') {
    return 'heart-icon';
  }

  if (cover.kind === 'url') {
    return cover.url ? normalizeImageUrlForSize(cover.url, px) : null;
  }

  if (cover.kind === 'coverartarchive') {
    return buildCoverArtArchiveUrl(cover.mbid, cover.mbidType, size)
  }

  const state = store.getState();
  const active = selectActiveServer(state);

  if (!active) return null;

  const provider = SERVER_PROVIDERS[active.type];
  if (!provider) return null;
  return provider.buildCoverUrl(withServerCredentials(active), cover, px);
}
