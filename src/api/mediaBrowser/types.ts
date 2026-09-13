/**
 * Raw shapes returned by the Jellyfin/Emby `/Items`-family endpoints. Only
 * the fields this adapter actually reads are modeled — both servers return
 * far more than this, and callers ask for extra fields via `Fields=...`
 * query params per-endpoint, so every field here is optional.
 */
export interface MediaBrowserProviderIds {
  MusicBrainz?: string;
  MusicBrainzAlbum?: string;
  /**
   * The release-group id, distinct from `MusicBrainzAlbum` (a specific
   * release). Cover Art Archive and other MBID consumers need to know which
   * kind of id they were handed — domain `ExternalIds.mbidType` records it.
   */
  MusicBrainzReleaseGroup?: string;
  /** Recording MBID for an individual track; ID3-tagged libraries only. */
  MusicBrainzTrack?: string;
}

export interface MediaBrowserImageTags {
  Primary?: string;
}

export interface MediaBrowserUserData {
  PlayCount?: number;
  LastPlayedDate?: string;
  /** 100ns ticks — the resume position the "Continue Watching" surface reads. */
  PlaybackPositionTicks?: number;
}

export interface MediaBrowserMediaStream {
  Type?: string;
  BitRate?: number;
  SampleRate?: number;
  BitDepth?: number;
}

export interface MediaBrowserMediaSource {
  RunTimeTicks?: number;
  Bitrate?: number;
  Container?: string;
  MediaStreams?: MediaBrowserMediaStream[];
}

export interface MediaBrowserArtistRef {
  Id?: string;
  Name?: string;
  ProviderIds?: MediaBrowserProviderIds;
}

export interface MediaBrowserItem {
  Id?: string;
  Name?: string;
  Type?: string;
  ArtistItems?: MediaBrowserArtistRef[];
  Artists?: string[];
  AlbumId?: string;
  AlbumArtist?: string;
  AlbumArtistId?: string;
  AlbumPrimaryImageTag?: string;
  RunTimeTicks?: number;
  MediaSources?: MediaBrowserMediaSource[];
  Genres?: string[];
  ProviderIds?: MediaBrowserProviderIds;
  ImageTags?: MediaBrowserImageTags;
  UserData?: MediaBrowserUserData;
  PremiereDate?: string;
  DateCreated?: string;
  DateLastMediaAdded?: string;
  ProductionYear?: number;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  PlaylistItemId?: string;
  CollectionType?: string;
  /**
   * Free-text artist bio. `getArtists.ts` already requests it via
   * `Fields=Overview` but nothing previously read it back off the DTO.
   */
  Overview?: string;
}

export interface MediaBrowserItemsResponse<T = MediaBrowserItem> {
  Items?: T[];
}
