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
   * The row's thumbnail gets them too, on both platforms: Android serves
   * browse covers through the engine's own content provider, which fetches
   * with the headers, because a car fetching a URL itself cannot send them.
   */
  headers?: Record<string, string>;
  artworkHeaders?: Record<string, string>;
  /** Seconds. */
  duration?: number;
  children?: BrowseItem[];
  /**
   * A row that does something rather than playing one thing: `shuffle` plays
   * the tracks beside it in random order. It has no `url` and no `children`.
   */
  action?: 'shuffle';
}

/** A top-level grouping — Favorites, Playlists, Albums. The car draws each as a tab. */
export interface BrowseCategory {
  mediaId: string;
  title: string;
  /** The tab's icon. */
  icon?: 'recent' | 'favorites' | 'albums' | 'artists' | 'playlists' | 'downloads' | 'radio' | 'library';
  /**
   * How the tab draws its rows on Android Auto: `grid` for covers, `list` for
   * tracks. Folders inside a grid tab draw their own tracks as a list.
   */
  layout?: 'list' | 'grid';
  items: BrowseItem[];
}
