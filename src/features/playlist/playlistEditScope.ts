/**
 * Playlist entry edits run one at a time.
 *
 * Adds, removes and moves address entries by position, and each is computed
 * against the playlist as the previous edit left it. Sent concurrently, a
 * second drag could reach the server before the first and move the wrong
 * entry. React Query runs mutations that share a scope in order.
 */
export const PLAYLIST_EDIT_SCOPE = { id: 'playlist-entries' } as const;
