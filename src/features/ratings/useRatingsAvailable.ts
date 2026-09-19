import { useApi } from '@/providers/registry/useApi'

/**
 * Whether this server has ratings at all.
 *
 * Presence on the adapter, never the provider's name: a server that grows a
 * ratings endpoint declares one and every surface below appears, with no edit
 * here. Today that is Subsonic; `docs/integrations.md` says why it is not
 * Jellyfin, Emby or Plex.
 *
 * Its own module, and deliberately: the settings screen and the library's
 * sort sheet call this to decide whether to offer a switch and an order, and
 * neither of them has any business loading the haptics engine and the toast
 * store that the *writing* side needs. Importing this from `useRatings`
 * dragged `expo-haptics` into the settings screen.
 */
export function useRatingsAvailable(): boolean {
  return Boolean(useApi().ratings)
}
