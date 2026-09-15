/**
 * The browsable tree the app hands to CarPlay and Android Auto.
 *
 * These were `@rntp/player`'s types, kept in the app's own shape — categories
 * of items — rather than adopting the engine's recursive `BrowseNode`,
 * because this is what `useCarPlayBrowseTree` already builds.
 * `createEngineBackend` converts.
 */

/**
 * One row: either a track or a folder of them.
 *
 * `url` and `children` are the discriminator, and both are optional because
 * the app builds both kinds. An Albums category holds album rows that carry
 * `children` and no `url`; those children are tracks that carry a `url` and
 * no children. A row with neither is a dead end and is filtered out before
 * publishing.
 */
export interface BrowseItem {
  mediaId: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  /** Set on playable rows. Its absence is what makes a row a folder. */
  url?: string;
  /**
   * Ephemeral request headers for a header-authenticated server (a Plex behind
   * a Basic-auth proxy). `headers` fetches the audio, `artworkHeaders` the
   * artwork — both the row's own thumbnail in the browse list and the
   * now-playing cover once the leaf plays. Set only when the active server
   * needs them.
   *
   * The thumbnail used to be the exception: `BrowseNode` had no field for
   * headers, so protected-server art rendered on the now-playing screen and
   * not in the car's list. It carries them as of engine 1.0.7 — on iOS. On
   * Android the row's cover goes through Media3, which takes a URI and
   * fetches it itself with no hook for a header, so the gap survives there
   * and is declared in the engine's `Tools/parity.py`.
   */
  headers?: Record<string, string>;
  artworkHeaders?: Record<string, string>;
  /** Seconds. */
  duration?: number;
  children?: BrowseItem[];
}

/** A top-level grouping — Favorites, Playlists, an album. */
export interface BrowseCategory {
  mediaId: string;
  title: string;
  items: BrowseItem[];
}
