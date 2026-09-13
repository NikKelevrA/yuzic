/**
 * What a provider can actually do, as callable implementations.
 *
 * Every value here is a function the caller invokes. The previous contract
 * declared capabilities as `SlotImpl = unknown` markers — a provider announced
 * that it filled a slot, and the caller then had to know, separately and by
 * name, which provider to call and how. That is not an abstraction over
 * providers; it is a second thing to keep in sync with the first, and the two
 * registries that used it said so in their own comments.
 *
 * A capability is added here when its first real consumer exists. Declaring
 * one ahead of that produces exactly the marker this replaces.
 */
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { CoverSource } from '@/types/Cover';

/** Fields an integration can contribute to an artist it recognises. */
export interface ArtistEnrichment {
  biography?: string;
  tags?: string[];
  cover?: CoverSource;
  externalIds?: ExternalIds;
}

/** Fields an integration can contribute to an album it recognises. */
export interface AlbumEnrichment {
  cover?: CoverSource;
  externalIds?: ExternalIds;
}

export interface LyricLine {
  startMs: number;
  text: string;
}

export interface Lyrics {
  lines: LyricLine[];
  /** True when `lines` carry real timings rather than one block of text. */
  synced: boolean;
}

/** A listen, as reported to a scrobble destination. */
export interface Listen {
  song: Song;
  /** Unix ms when playback started. Preserved across an offline replay. */
  startedAt: number;
}

/** One shelf of content for the Home screen. */
export interface DiscoveryShelf {
  titleKey: string;
  albums: Album[];
}

/** Which entity kinds a search should ask for. */
export interface CatalogueSearchKinds {
  artists: boolean;
  albums: boolean;
}

/** One hit, with the second line the provider chose for it. */
export interface CatalogueSearchMatch<T> {
  entity: T;
  subtitle: string;
}

export interface CatalogueSearchResults {
  artists: CatalogueSearchMatch<Artist>[];
  albums: CatalogueSearchMatch<Album>[];
}

export interface AcquisitionRequest {
  artist: string;
  title: string;
  externalIds: ExternalIds;
}

export interface AcquisitionResult {
  accepted: boolean;
  message?: string;
}

/**
 * The capabilities a provider may implement.
 *
 * Keys are capability names, values are the callable each provider supplies.
 * A provider declares a `Partial<CapabilityMap>`; the broker hands back the
 * implementation, and the feature calls it without knowing whose it is.
 */
export interface CapabilityMap {
  /** Fill gaps in an artist record — biography, tags, artwork. */
  'artist.enrich': (artist: Artist) => Promise<ArtistEnrichment | null>;
  /** Fill gaps in an album record. Cover Art Archive needs a release id. */
  'album.enrich': (album: Album) => Promise<AlbumEnrichment | null>;
  /** Artists related to this one, for the similar-artists rail. */
  'similarity.artists': (artist: Artist, limit: number) => Promise<Artist[]>;
  /** Tracks similar to this one, for autoplay and smart shuffle. */
  'similarity.songs': (song: Song, limit: number) => Promise<Song[]>;
  /** A Home shelf this provider can populate. */
  'discovery.shelf': () => Promise<DiscoveryShelf | null>;
  /** Build a playlist on the provider from a seed, returning its id. */
  'playlist.generate': (seed: Song, size: number) => Promise<string>;
  /** Lyrics for a song, synced where the provider has them. */
  lyrics: (song: Song) => Promise<Lyrics | null>;
  /** Report a listen. At most one destination is active per route. */
  scrobble: (listen: Listen) => Promise<void>;
  /** Ask a downloader to fetch a whole release. */
  'acquisition.album': (request: AcquisitionRequest) => Promise<AcquisitionResult>;
  /** Ask a downloader to fetch a single track. */
  'acquisition.track': (request: AcquisitionRequest) => Promise<AcquisitionResult>;
  /** Browse a catalogue this provider holds but the user does not own. */
  'catalogue.album': (nativeId: string) => Promise<AlbumDetail | null>;
  /**
   * Free-text search of a catalogue the user does not own.
   *
   * Returns domain entities, so who found a result is already on the result —
   * its provenance — rather than a separate tag the caller has to carry. The
   * `subtitle` rides alongside because it is genuinely the provider's to
   * choose: one catalogue's second line is the album's artist, another's is a
   * release year, and neither is derivable from the other.
   */
  'catalogue.search': (
    query: string,
    kinds: CatalogueSearchKinds
  ) => Promise<CatalogueSearchResults>;
}

export type CapabilityName = keyof CapabilityMap;

/** What a provider declares. Absent means "cannot do this", never "unknown". */
export type Capabilities = Partial<CapabilityMap>;
