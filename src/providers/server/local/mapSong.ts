/**
 * Local imported-file record -> domain Song.
 *
 * `LocalTrack` (`./store.ts`) is the raw shape here: local files have no
 * server protocol, so the on-device import record — tags read at import time
 * plus the private-storage path the file was copied to — plays the role a
 * Subsonic/MediaBrowser/Plex DTO plays for a real server.
 *
 * No stream URL is produced here, matching every other provider's mapper: a
 * `Song` carries the id a stream is built from, not a built path, even though
 * for local files that "stream" is just the private file URI.
 */
import type { Song } from '@/domain/entities/Song';
import { albumCoverSubject, coverOrMissing } from '@/domain/entities/Cover';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import { albumRef, artistRef } from './mapRefs';
import type { LocalTrack } from './store';
import { internCover } from '@/domain/entities/internRef';

function externalIdsOf(dto: LocalTrack): ExternalIds {
  const ids: ExternalIds = {};
  if (dto.externalIds?.mbid) ids.mbid = dto.externalIds.mbid;
  if (dto.externalIds?.isrc) ids.isrc = dto.externalIds.isrc;
  return ids;
}

interface MapSongContext {
  provenance: Provenance;
}

export function mapSong(dto: LocalTrack, context: MapSongContext): Song {
  const { provenance } = context;
  const nativeId = dto.id;
  // A file with no embedded art names its album, for a backup to fill.
  const cover = internCover(coverOrMissing(dto.cover, albumCoverSubject(dto.albumTitle, dto.artist)));

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: externalIdsOf(dto),
    // A file the user imported is, by definition, in their library.
    libraryState: 'in-library',
    title: dto.title,
    artist: artistRef(provenance, dto.artistId, dto.artist),
    album: albumRef(provenance, dto.albumId, dto.albumTitle, cover),
    cover,
    // The metadata reader used at import time is tags-only and does not
    // report duration; `duration` is a placeholder ('0') until the playback
    // engine loads the file and reports the real value — see store.ts.
    durationSeconds: Number(dto.duration) || 0,
    contentKind: 'song',
    // The importer keys tracks by a generated id but streams from the copied
    // file's own path, so `streamId` genuinely differs from `nativeId` here.
    streamId: dto.streamId !== dto.id ? dto.streamId : undefined,
    trackNumber: dto.trackNumber,
    year: dto.year,
    genres: dto.genres ?? [],
    addedAt: dto.dateAdded ? Date.parse(dto.dateAdded) || undefined : undefined,
    audio: {
      bitrateKbps: dto.bitrate,
      sampleRateHz: dto.sampleRate,
      bitsPerSample: dto.bitsPerSample,
      mimeType: dto.mimeType,
    },
  };
}
