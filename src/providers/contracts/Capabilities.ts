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
 * one ahead of that produces exactly the marker this replaces — and that is
 * what happened: similarity, discovery, playlist generation, scrobbling and
 * acquisition were declared, implemented a second time beside the features
 * that already did those jobs, and never asked for by anything. They were
 * removed rather than wired in, because the feature implementations carry
 * behaviour the declarations did not (queue over-sampling, per-call
 * downloader options and error codes, the offline scrobble queue). When a
 * second provider for one of those jobs arrives, the capability comes back
 * shaped by both.
 */
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { ExternalIds } from '@/domain/identity/ExternalIds';

/**
 * Fields an integration can contribute to an artist it recognises.
 *
 * No picture: every image goes through cover resolution
 * (`features/artwork/coverResolution`), whichever item it belongs to.
 */
interface ArtistEnrichment {
  biography?: string;
  tags?: string[];
  externalIds?: ExternalIds;
}

/** Which entity kinds a search should ask for. */
interface CatalogueSearchKinds {
  artists: boolean;
  albums: boolean;
  /** A provider that has no song search of its own (Deezer today) simply
   *  ignores this and returns none — the same way it already handles being
   *  asked for nothing at all. Optional so call sites that predate song
   *  search (and existing tests) don't all need updating just to add
   *  `songs: false`. */
  songs?: boolean;
}

/** One hit, with the second line the provider chose for it. */
interface CatalogueSearchMatch<T> {
  entity: T;
  subtitle: string;
  /**
   * The album's artist by name, when the provider's `subtitle` is not itself
   * that name. `subtitle` is what a row shows; this is what a follow-up
   * lookup (matching the library, searching another catalogue) must use, so
   * it can never be a year or any other decoration. Omitted when `subtitle`
   * already is the artist's name.
   */
  artistName?: string;
}

interface CatalogueSearchResults {
  artists: CatalogueSearchMatch<Artist>[];
  albums: CatalogueSearchMatch<Album>[];
  /** Absent from a provider that predates song search, or simply never
   *  implements it (Deezer today) — callers read it as `found.songs ?? []`. */
  songs?: CatalogueSearchMatch<Song>[];
}

/**
 * The capabilities a provider may implement.
 *
 * Keys are capability names, values are the callable each provider supplies.
 * A provider declares a `Partial<CapabilityMap>`; the broker hands back the
 * implementation, and the feature calls it without knowing whose it is.
 */
export interface CapabilityMap {
  /** Fill gaps in an artist record — biography and tags. */
  'artist.enrich': (artist: Artist) => Promise<ArtistEnrichment | null>;
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
