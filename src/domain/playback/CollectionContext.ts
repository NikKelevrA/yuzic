/**
 * The album or playlist a queued track was chosen from.
 *
 * `contextId` is the origin's own id (`nativeId`), because that is how play
 * statistics are keyed: a playlist play is recorded under this id and Home's
 * Recently Played shelf looks playlists up by `nativeId`. Recording the
 * `localId` here once made every playlist play unfindable.
 */
export interface CollectionContext {
  contextId: string;
  contextType: 'album' | 'playlist';
}
