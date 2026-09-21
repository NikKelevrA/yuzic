/**
 * Local imported-file records -> domain Artist.
 *
 * Local files have no separate artist record the way a server's catalog
 * does — `index.ts` already derives an artist by grouping tracks on
 * `artistId`. `LocalArtistGroup` is that grouping made explicit as this
 * mapper's input, playing the role a server's artist DTO plays elsewhere.
 */
import type { Artist } from '@/domain/entities/Artist';
import { artistCoverSubject, missingCover } from '@/domain/entities/Cover';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { LocalTrack } from './store';

export interface LocalArtistGroup {
  artistId: string;
  /** All imported tracks by this artist; only the first's name is read. */
  tracks: LocalTrack[];
}

export function mapArtist(group: LocalArtistGroup, provenance: Provenance): Artist {
  const nativeId = group.artistId;
  const name = group.tracks[0]?.artist ?? 'Unknown Artist';
  // Other providers leave `albumIds` for a caller to populate once albums are
  // separately loaded (see the Navidrome/MediaBrowser/Plex mappers), because
  // fetching them is a further network round trip there. A local library has
  // no such cost — every track is already in memory — so the ids are derived
  // here rather than left empty for no reason.
  const albumIds: LocalId[] = [...new Set(group.tracks.map(track => track.albumId))]
    .map(albumId => makeLocalId('album', provenance, albumId));

  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    provenance,
    // The `@missingcore/audio-metadata` tag reader used at import time does
    // not surface a MusicBrainz id.
    externalIds: {},
    // A file the user imported is, by definition, in their library.
    name,
    // Imported files carry album art at most; the gap names the artist.
    cover: missingCover(artistCoverSubject(name)),
    tags: [],
    albumIds,
  };
}
