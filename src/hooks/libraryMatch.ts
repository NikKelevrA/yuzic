import { normalize } from '@/utils/normalize';
import type { Album, AlbumBase, Artist, ExternalAlbumBase, ExternalArtistBase } from '@/types';
import type { Album as DomainAlbum } from '@/domain/entities/Album';
import type { Artist as DomainArtist } from '@/domain/entities/Artist';

// Shared match predicates — reused by ExternalResolutionProvider (pre-navigation
// routing) and useExternalAlbumStatus (in-row "already in library" checkmark) so
// all call sites agree on what counts as the same album/artist.
//
// For Deezer-sourced items, item.id is a Deezer numeric id and never equals a
// MusicBrainz mbid — only item.externalIds?.mbid is safe to compare against a
// local record's mbid field.

type MatchableAlbum = Album | AlbumBase | DomainAlbum;

// The pre-rewrite album shapes carry a top-level `mbid`; the domain `Album`
// only carries `externalIds.mbid`. Narrowing on `'mbid' in a` reads the right
// one from either shape without a cast.
function albumMbid(a: MatchableAlbum): string | null | undefined {
  return 'mbid' in a ? a.mbid : a.externalIds?.mbid;
}

export function matchAlbumToLibrary(
  item: ExternalAlbumBase,
  albums: MatchableAlbum[]
): MatchableAlbum | null {
  const normTitle = normalize(item.title);
  const normArtist = normalize(item.artist);
  const mbid = item.externalIds?.mbid;
  return albums.find(a => {
    const localMbid = albumMbid(a);
    return (
      (mbid && localMbid && localMbid === mbid) ||
      (normalize(a.title) === normTitle && normalize(a.artist.name) === normArtist)
    );
  }) ?? null;
}

type MatchableArtist = Artist | DomainArtist;

/** Same split as `albumMbid`: pre-rewrite artists carry a top-level `mbid`. */
function artistMbid(a: MatchableArtist): string | null | undefined {
  return 'mbid' in a ? a.mbid : a.externalIds?.mbid;
}

/**
 * The id to ask the origin about a matched artist by.
 *
 * Pre-rewrite artists called it `id`; a domain artist separates the origin's
 * own id (`nativeId`) from on-device identity. Callers here always want the
 * former, because the next thing they do is fetch the artist.
 */
export function matchedArtistNativeId(a: MatchableArtist): string {
  return 'nativeId' in a ? a.nativeId : a.id;
}

export function matchArtistToLibrary(
  item: ExternalArtistBase,
  artists: MatchableArtist[]
): MatchableArtist | null {
  const normName = normalize(item.name);
  const mbid = item.externalIds?.mbid;
  return artists.find(a =>
    (mbid && artistMbid(a) && artistMbid(a) === mbid) ||
    normalize(a.name) === normName
  ) ?? null;
}
