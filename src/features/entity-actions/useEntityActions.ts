/**
 * Resolves which actions apply to a given entity, in order.
 *
 * React's rules of hooks rule out one hook that branches on entity kind at
 * runtime — each kind needs a different, fixed set of underlying data hooks
 * (a song's star hooks aren't an album's; a playlist has no lazy artist-songs
 * fetch). So this is a family of kind-specific hooks, one per (kind, origin)
 * pair, each of which:
 *   1. calls the handful of shared/app hooks that kind actually needs,
 *   2. assembles them into that kind's typed action context,
 *   3. resolves the context against that kind's declarative action list
 *      (`registry/*Actions.ts`) via the one shared `resolveActions` in
 *      `types.ts`.
 *
 * Every sheet in `src/components/options/` calls exactly one of these
 * directly from its own `hooks/*.ts` module (not through this barrel) so
 * that, say, the song sheet's test doesn't have to stub out playlist
 * rename/delete wiring it never touches. This file is the family's public
 * surface for everything else — `src/features/entity-actions/useEntityActions.test.tsx`
 * exercises it end to end — and the resolution logic itself (step 3 above)
 * lives once, in `resolveActions`.
 */
export { useSongLibraryActions, useSongExternalActions } from './hooks/useSongActions';
export { useAlbumLibraryActions, useAlbumExternalActions } from './hooks/useAlbumActions';
export { useArtistOptionsActions } from './hooks/useArtistActions';
export { usePlaylistOptionsActions } from './hooks/usePlaylistActions';
