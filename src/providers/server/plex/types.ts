/** Plex JSON shapes. Plex returns many more fields; these are the fields Yuzic
 * actually consumes, intentionally all optional because scanners and agents
 * populate different subsets. */
export type PlexGenre = { tag?: string };

/**
 * An alternate identifier Plex's metadata agents attach to an item, as
 * `scheme://value` — e.g. `mbid://<uuid>` when a music agent matched the item
 * to MusicBrainz. Present only when the section's agent resolves external
 * ids; the built-in Plex Music agent generally does not, third-party ones
 * (e.g. MusicBrainz-backed agents) do.
 */
export type PlexGuid = { id?: string };

export type PlexPart = {
  id?: number | string;
  key?: string;
  duration?: number;
  file?: string;
  size?: number;
  container?: string;
};

export type PlexMedia = {
  id?: number | string;
  duration?: number;
  bitrate?: number;
  audioCodec?: string;
  container?: string;
  audioChannels?: number;
  Part?: PlexPart[];
};

export type PlexMetadata = {
  ratingKey?: string | number;
  key?: string;
  type?: 'artist' | 'album' | 'track' | 'playlist' | string;
  title?: string;
  parentTitle?: string;
  grandparentTitle?: string;
  parentRatingKey?: string | number;
  grandparentRatingKey?: string | number;
  parentKey?: string;
  grandparentKey?: string;
  thumb?: string;
  parentThumb?: string;
  grandparentThumb?: string;
  art?: string;
  duration?: number;
  year?: number;
  parentYear?: number;
  index?: number;
  parentIndex?: number;
  addedAt?: number;
  updatedAt?: number;
  originallyAvailableAt?: string;
  viewCount?: number;
  lastViewedAt?: number;
  userRating?: number;
  Genre?: PlexGenre[];
  Media?: PlexMedia[];
  summary?: string;
  playlistType?: string;
  leafCount?: number;
  /** Alternate ids, including a `mbid://` entry where an agent resolved one. */
  Guid?: PlexGuid[];
};

export type PlexDirectory = {
  key?: string | number;
  title?: string;
  type?: string;
};

export type PlexHub = {
  type?: string;
  title?: string;
  Metadata?: PlexMetadata[];
};

export type PlexMediaContainer = {
  size?: number;
  totalSize?: number;
  Metadata?: PlexMetadata[];
  Directory?: PlexDirectory[];
  Hub?: PlexHub[];
};

export type PlexResponse = { MediaContainer?: PlexMediaContainer };

export type PlexPinResponse = {
  id?: number | string;
  code?: string;
  authToken?: string;
  expiresAt?: string;
};
