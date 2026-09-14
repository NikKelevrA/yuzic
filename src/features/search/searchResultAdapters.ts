/**
 * `SearchResult` (src/contexts/searchRanking.ts) is a display-flattened
 * aggregate across all four entity kinds, not a domain entity itself — it has
 * no `localId`/`provenance` of its own. `ArtistRow`/`PlaylistRow`/`AlbumRow`
 * (src/components/rows) all require a real domain `Artist`/`Playlist`/`Album`,
 * so the functions here rebuild one from a result's fields, the same way
 * `resourceFromPlayerItem` rebuilds refs from a bare id.
 *
 * Each `resultTo*` function is the single place that decides local vs.
 * external provenance for its entity kind — one function, called once per
 * row, rather than the result's `source` field steering which of two
 * components gets rendered. `entityTo*` cover the same job for a persisted
 * `SearchEntityEntry` (src/state/redux/slices/searchHistorySlice.ts), which
 * carries the same loose id/title/cover fields but isn't a `SearchResult`.
 */
import type { SearchResult } from '@/features/search/searchRanking';
import type { CoverSource } from '@/types/Cover';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Playlist } from '@/domain/entities/Playlist';
import { makeLocalId } from '@/domain/identity/LocalId';
import { normalizeExternalIds } from '@/domain/identity/ExternalIds';
import { integrationProvenance, serverProvenance } from '@/domain/identity/Provenance';
import type { SearchEntityEntry } from '@/state/redux/slices/searchHistorySlice';

/** True when `artist` came from an external catalog rather than the user's
 *  library — mirrors `AlbumRow`'s `isExternalAlbum`, which has no artist
 *  equivalent of its own. */
export const isExternalArtist = (artist: Artist): boolean =>
  artist.provenance.origin === 'integration';

function externalAlbum(input: {
  id: string;
  title: string;
  artistName: string;
  cover: CoverSource;
  externalSource?: string;
  externalIds?: unknown;
}): Album {
  const provenance = integrationProvenance(input.externalSource ?? 'unknown');
  return {
    localId: makeLocalId('album', provenance, input.id),
    nativeId: input.id,
    provenance,
    externalIds: normalizeExternalIds(input.externalIds),
    libraryState: 'external',
    title: input.title,
    cover: input.cover,
    artist: {
      localId: makeLocalId('artist', provenance, ''),
      nativeId: '',
      externalIds: {},
      name: input.artistName,
      cover: { kind: 'none' },
    },
    releaseType: 'album',
    genres: [],
    songIds: [],
  };
}

function localAlbum(result: SearchResult, activeServerId: string | undefined): Album {
  const provenance = serverProvenance(activeServerId ?? '');
  return {
    localId: makeLocalId('album', provenance, result.id),
    nativeId: result.id,
    provenance,
    externalIds: normalizeExternalIds(result.externalIds),
    libraryState: 'in-library',
    title: result.title,
    cover: result.cover,
    artist: {
      localId: makeLocalId('artist', provenance, ''),
      nativeId: '',
      externalIds: {},
      name: result.subtext,
      cover: { kind: 'none' },
    },
    releaseType: 'album',
    genres: [],
    songIds: [],
  };
}

/** An album row's domain entity, whichever provenance the result carries. */
export function resultToAlbum(result: SearchResult, activeServerId: string | undefined): Album {
  return result.source === 'external'
    ? externalAlbum({
        id: result.id,
        title: result.title,
        artistName: result.subtext,
        cover: result.cover,
        externalSource: result.externalSource,
        externalIds: result.externalIds,
      })
    : localAlbum(result, activeServerId);
}

/** A recent-history album entity's domain entity — always external; a local
 *  album entry navigates by id directly and never reaches here. */
export function entityToAlbum(entity: SearchEntityEntry): Album {
  return externalAlbum({
    id: entity.id,
    title: entity.title,
    artistName: entity.subtitle,
    cover: entity.cover,
    externalSource: entity.externalSource,
    externalIds: entity.externalIds,
  });
}

function externalArtist(input: {
  id: string;
  name: string;
  cover: CoverSource;
  externalSource?: string;
  externalIds?: unknown;
}): Artist {
  const provenance = integrationProvenance(input.externalSource ?? 'unknown');
  return {
    localId: makeLocalId('artist', provenance, input.id),
    nativeId: input.id,
    provenance,
    externalIds: normalizeExternalIds(input.externalIds),
    libraryState: 'external',
    name: input.name,
    cover: input.cover,
    tags: [],
    albumIds: [],
  };
}

/** An artist row's domain entity, whichever provenance the result carries. */
export function resultToArtist(result: SearchResult, activeServerId: string | undefined): Artist {
  const provenance = result.source === 'external'
    ? integrationProvenance(result.externalSource ?? 'unknown')
    : serverProvenance(activeServerId ?? '');
  return {
    localId: makeLocalId('artist', provenance, result.id),
    nativeId: result.id,
    provenance,
    externalIds: normalizeExternalIds(result.externalIds),
    libraryState: result.source === 'external'
      ? (result.isDownloaded ? 'in-library' : 'external')
      : 'in-library',
    name: result.title,
    cover: result.cover,
    tags: [],
    albumIds: [],
  };
}

/** A recent-history artist entity's domain entity — always external, same
 *  reasoning as `entityToAlbum`. */
export function entityToArtist(entity: SearchEntityEntry): Artist {
  return externalArtist({
    id: entity.id,
    name: entity.title,
    cover: entity.cover,
    externalSource: entity.externalSource,
    externalIds: entity.externalIds,
  });
}

/** A playlist row's domain entity. Playlists have no external form today —
 *  `SearchEntityType` (src/features/search/SearchContext.tsx) only covers
 *  album/artist — so this is always local. */
export function resultToPlaylist(result: SearchResult, activeServerId: string | undefined): Playlist {
  const provenance = serverProvenance(activeServerId ?? '');
  return {
    localId: makeLocalId('playlist', provenance, result.id),
    nativeId: result.id,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: result.title,
    cover: result.cover,
    isOwned: true,
    songIds: [],
  };
}
