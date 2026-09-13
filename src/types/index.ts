/**
 * Types that are not domain entities.
 *
 * The entities themselves — Artist, Album, Song, Playlist, and the identity,
 * library-state and playback-kind types they depend on — live in `src/domain`.
 * What remains here describes the app's own configuration and presentation
 * concerns: which servers are configured, how a cover is addressed, and the
 * shape of each integration's settings.
 */
export * from './Server';
export * from './Cover';
export * from './Genre';
export * from './Configs';
