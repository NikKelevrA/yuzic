/**
 * Local imported-file records -> domain Album.
 *
 * Local files have no separate album record the way a server's catalog
 * does — `index.ts` already derives an album by grouping tracks on
 * `albumId`. `LocalAlbumGroup` is that grouping made explicit as this
 * mapper's input, playing the role a server's album DTO plays elsewhere.
 */
import type { Album, ReleaseType } from '@/domain/entities/Album';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import { artistRef } from './mapRefs';
import type { LocalTrack } from './store';

export interface LocalAlbumGroup {
  albumId: string;
  /** All imported tracks on this album; only the first's tags are read. */
  tracks: LocalTrack[];
}

export interface MapAlbumContext {
  provenance: Provenance;
  /**
   * Ids of the album's tracks, in running order, where they have been mapped.
   * Passed in rather than derived here so that mapping an album never implies
   * mapping its songs.
   */
  songIds?: LocalId[];
}

export function mapAlbum(group: LocalAlbumGroup, context: MapAlbumContext): Album {
  const { provenance } = context;
  const nativeId = group.albumId;
  const first = group.tracks[0];

  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    provenance,
    // Tag reading at import time does not surface a MusicBrainz release id.
    externalIds: {},
    // A file the user imported is, by definition, in their library.
    libraryState: 'in-library',
    title: first?.albumTitle ?? 'Unknown Album',
    cover: first?.cover ?? { kind: 'none' },
    artist: artistRef(provenance, first?.artistId, first?.artist),
    year: first?.year,
    // Imported files carry no release-type tag; everything is presented as
    // an album unless a provider that knows better says otherwise.
    releaseType: 'album' satisfies ReleaseType,
    genres: [],
    addedAt: first?.dateAdded ? Date.parse(first.dateAdded) || undefined : undefined,
    songIds: context.songIds ?? [],
  };
}
