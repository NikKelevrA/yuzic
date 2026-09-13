/**
 * The domain layer: entities, identity and the pure policies over them.
 *
 * Nothing here imports a provider, a React hook, or the store. Everything here
 * is safe to call from a test without a running app.
 */
export * from './entities/EntityCore';
export * from './entities/EntityRef';
export * from './entities/Artist';
export * from './entities/Album';
export * from './entities/Song';
export * from './entities/Playlist';
export * from './entities/Detail';
export * from './identity/LocalId';
export * from './identity/Provenance';
export * from './identity/ExternalIds';
export * from './identity/matching';
export * from './library/LibraryState';
export * from './playback/ContentKind';
