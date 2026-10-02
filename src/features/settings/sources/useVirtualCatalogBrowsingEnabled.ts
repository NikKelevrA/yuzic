import { useSelector } from 'react-redux';
import { selectVirtualCatalogBrowsingEnabled } from './state';

/**
 * Whether tapping a search result that only exists in a self-hosted catalog
 * bridge's virtual entries (see `domain/identity/virtualCatalogId`) should
 * live-fetch its real discography from the active server, rather than show
 * an empty page sourced from the synced library cache.
 *
 * Off by default — see the state field's own doc comment for why this is a
 * standalone opt-in rather than folded into `useSelfHostedMusicbrainzConfigured`.
 */
export function useVirtualCatalogBrowsingEnabled(): boolean {
  return useSelector(selectVirtualCatalogBrowsingEnabled);
}
