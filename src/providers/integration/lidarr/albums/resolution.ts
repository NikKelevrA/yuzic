import type { Album } from '@/domain/entities/Album';
import type { LidarrArtistLookupResult } from '../artists';

/**
 * Deciding which Lidarr artist and album a request means, from what Lidarr
 * returned. No network here: every rule that can send a download to the wrong
 * album is a pure function of the candidates and the request, and is tested as
 * one.
 */

export type LidarrAlbumRequest = {
  albumTitle: string;
  artistName: string;
  albumMbid?: string | null;
  artistMbid?: string | null;
  albumDeezerId?: string;
  artistDeezerId?: string;
  releaseDate?: string;
  releaseType?: 'album' | 'single';
};

export type LidarrAlbum = {
  id: number;
  title: string;
  foreignAlbumId?: string;
  artistId: number;
  monitored?: boolean;
  releaseDate?: string;
  albumType?: string;
  statistics?: {
    percentOfTracks?: number;
    trackFileCount?: number;
    totalTrackCount?: number;
  };
  [key: string]: unknown;
};

export type ArtistResolution =
  | {
      ok: true;
      artist: LidarrArtistLookupResult;
      matchedBy: 'mbid' | 'deezer' | 'name';
    }
  | {
      ok: false;
      code:
        | 'artist_identity_unresolved'
        | 'artist_identity_ambiguous'
        | 'external_identity_mismatch';
    };

export type AlbumResolution =
  | {
      ok: true;
      album: LidarrAlbum;
      matchedBy: 'mbid' | 'title' | 'release';
    }
  | {
      ok: false;
      code: 'album_not_found_for_artist' | 'album_identity_ambiguous';
    };

export const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

export const cleanId = (value?: string | null) => value?.trim().toLowerCase() || undefined;

function deezerArtistIds(artist: LidarrArtistLookupResult): string[] {
  const ids = new Set<string>();
  for (const link of artist.links ?? []) {
    if (!link.url) continue;
    const match = link.url.match(
      /^https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)(?:[/?#]|$)/i
    );
    if (match?.[1]) ids.add(match[1]);
  }
  return [...ids];
}

function sameArtist(
  left: LidarrArtistLookupResult,
  right: LidarrArtistLookupResult
) {
  return cleanId(left.foreignArtistId) === cleanId(right.foreignArtistId);
}

/**
 * Domain `ReleaseType` has four values (`album`/`single`/`ep`/`compilation`);
 * Lidarr resolution only ever disambiguates album vs. single-length releases
 * (`resolveAlbumCandidate`'s `matchesReleaseType` groups Lidarr's own
 * `Single`/`EP` the same way) — same collapsing the pre-rewrite Deezer
 * catalogue mapper already did.
 */
function lidarrReleaseType(releaseType: Album['releaseType']): 'album' | 'single' {
  return releaseType === 'single' || releaseType === 'ep' ? 'single' : 'album';
}

export function albumRequestFromExternal(album: Album): LidarrAlbumRequest {
  return {
    albumTitle: album.title,
    artistName: album.artist.name,
    albumMbid: album.externalIds.mbid,
    artistMbid: album.artist.externalIds.mbid,
    albumDeezerId: album.externalIds.deezerId,
    artistDeezerId: album.artist.externalIds.deezerId,
    releaseDate: album.releaseDate,
    releaseType: lidarrReleaseType(album.releaseType),
  };
}

export function resolveArtistCandidate(
  candidates: LidarrArtistLookupResult[],
  request: LidarrAlbumRequest
): ArtistResolution {
  const artistMbid = cleanId(request.artistMbid);
  const artistDeezerId = cleanId(request.artistDeezerId);

  if (artistMbid) {
    const mbidMatches = candidates.filter(
      candidate => cleanId(candidate.foreignArtistId) === artistMbid
    );
    if (mbidMatches.length > 1) {
      return { ok: false, code: 'artist_identity_ambiguous' };
    }
    if (mbidMatches.length === 1) {
      const artist = mbidMatches[0];
      if (artistDeezerId) {
        const candidateDeezerIds = deezerArtistIds(artist);
        const anotherDeezerMatch = candidates.some(
          candidate =>
            !sameArtist(candidate, artist) &&
            deezerArtistIds(candidate).includes(artistDeezerId)
        );
        if (
          anotherDeezerMatch ||
          (candidateDeezerIds.length > 0 &&
            !candidateDeezerIds.includes(artistDeezerId))
        ) {
          return { ok: false, code: 'external_identity_mismatch' };
        }
      }
      return { ok: true, artist, matchedBy: 'mbid' };
    }

    if (
      artistDeezerId &&
      candidates.some(candidate =>
        deezerArtistIds(candidate).includes(artistDeezerId)
      )
    ) {
      return { ok: false, code: 'external_identity_mismatch' };
    }
    return { ok: false, code: 'artist_identity_unresolved' };
  }

  if (artistDeezerId) {
    const deezerMatches = candidates.filter(candidate =>
      deezerArtistIds(candidate).includes(artistDeezerId)
    );
    if (deezerMatches.length === 1) {
      return {
        ok: true,
        artist: deezerMatches[0],
        matchedBy: 'deezer',
      };
    }
    if (deezerMatches.length > 1) {
      return { ok: false, code: 'artist_identity_ambiguous' };
    }
  }

  const normalizedArtist = normalize(request.artistName);
  const nameMatches = candidates.filter(
    candidate => normalize(candidate.artistName) === normalizedArtist
  );

  if (
    artistDeezerId &&
    nameMatches.some(candidate => deezerArtistIds(candidate).length > 0)
  ) {
    return { ok: false, code: 'external_identity_mismatch' };
  }
  if (nameMatches.length === 1) {
    return { ok: true, artist: nameMatches[0], matchedBy: 'name' };
  }
  if (nameMatches.length > 1) {
    return { ok: false, code: 'artist_identity_ambiguous' };
  }
  return { ok: false, code: 'artist_identity_unresolved' };
}

export function releaseYear(value?: string) {
  const match = value?.match(/^(\d{4})/);
  return match?.[1];
}

function matchesReleaseType(album: LidarrAlbum, type: 'album' | 'single') {
  const albumType = normalize(album.albumType ?? '');
  if (type === 'single') {
    return albumType === 'single' || albumType === 'ep';
  }
  return albumType === 'album';
}

export function resolveAlbumCandidate(
  albums: LidarrAlbum[],
  request: LidarrAlbumRequest
): AlbumResolution {
  const albumMbid = cleanId(request.albumMbid);
  if (albumMbid) {
    const matches = albums.filter(
      album => cleanId(album.foreignAlbumId) === albumMbid
    );
    if (matches.length === 1) {
      return { ok: true, album: matches[0], matchedBy: 'mbid' };
    }
    return {
      ok: false,
      code:
        matches.length > 1
          ? 'album_identity_ambiguous'
          : 'album_not_found_for_artist',
    };
  }

  const normalizedAlbum = normalize(request.albumTitle);
  let matches = albums.filter(
    album => normalize(album.title) === normalizedAlbum
  );
  if (matches.length === 0) {
    return { ok: false, code: 'album_not_found_for_artist' };
  }
  if (matches.length === 1) {
    return { ok: true, album: matches[0], matchedBy: 'title' };
  }

  const year = releaseYear(request.releaseDate);
  if (year) {
    matches = matches.filter(album => releaseYear(album.releaseDate) === year);
  }
  if (request.releaseType && matches.length > 1) {
    matches = matches.filter(album =>
      matchesReleaseType(album, request.releaseType!)
    );
  }

  if (matches.length === 1) {
    return { ok: true, album: matches[0], matchedBy: 'release' };
  }
  return {
    ok: false,
    code:
      matches.length === 0
        ? 'album_not_found_for_artist'
        : 'album_identity_ambiguous',
  };
}
