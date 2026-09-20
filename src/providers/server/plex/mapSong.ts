/**
 * Plex track DTO -> domain Song.
 *
 * No stream URL is produced here. A credentialled URL is not safe to persist
 * and goes stale with the session; the entity carries the id a stream can be
 * built from, and building one is the player boundary's job.
 */
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import { albumCoverSubject, missingCover, type CoverSource } from '@/domain/entities/Cover';
import { albumRef, artistRef } from './mapRefs';
import { mbidOf } from './externalIds';
import type { PlexMetadata } from './types';
import { internCover } from '@/domain/entities/internRef';

const id = (value: string | number | undefined): string => (value == null ? '' : String(value));

function genresOf(dto: PlexMetadata): string[] {
  return (dto.Genre ?? []).flatMap(genre => genre.tag?.split(';') ?? []).map(genre => genre.trim()).filter(Boolean);
}

function externalIdsOf(dto: PlexMetadata): ExternalIds {
  const mbid = mbidOf(dto);
  return mbid ? { mbid } : {};
}

interface MapSongContext {
  provenance: Provenance;
  /** The cover to use where the track carries none of its own — usually the album's. */
  cover?: CoverSource;
}

export function mapSong(dto: PlexMetadata, context: MapSongContext): Song {
  const { provenance } = context;
  const nativeId = id(dto.ratingKey);
  const cover: CoverSource = internCover(dto.thumb
    ? { kind: 'plex', path: dto.thumb }
    : dto.parentThumb
      ? { kind: 'plex', path: dto.parentThumb }
      : context.cover ?? missingCover(albumCoverSubject(dto.parentTitle, dto.grandparentTitle)));

  const media = dto.Media?.[0];
  const part = media?.Part?.[0];
  // Plex's catalog identity is `ratingKey`; the directly playable resource is
  // the first media part's `key`, a different id the player must stream from
  // instead. Only carry `streamId` when it actually differs from `nativeId`.
  const streamId = part?.key && part.key !== nativeId ? part.key : undefined;

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: externalIdsOf(dto),
    libraryState: 'in-library',
    title: dto.title ?? 'Unknown',
    artist: artistRef(provenance, id(dto.grandparentRatingKey), dto.grandparentTitle),
    album: albumRef(provenance, id(dto.parentRatingKey), dto.parentTitle, cover),
    cover,
    // Plex reports duration in milliseconds, not seconds.
    durationSeconds: Math.round((dto.duration ?? media?.duration ?? 0) / 1000),
    // Everything reachable through the library's track endpoints is a song;
    // Plex has no separate radio/podcast item type this adapter consumes.
    contentKind: 'song',
    streamId,
    discNumber: dto.parentIndex,
    trackNumber: dto.index,
    // Plex reports a track's own `year` inconsistently; `parentYear` (the
    // album's release year) is what the existing adapter has relied on.
    year: dto.parentYear,
    genres: genresOf(dto),
    addedAt: dto.addedAt ? dto.addedAt * 1000 : undefined,
    serverPlayCount: dto.viewCount,
    // Plex reports this in unix seconds; the domain stores unix ms.
    serverLastPlayedAt: dto.lastViewedAt ? dto.lastViewedAt * 1000 : undefined,
    audio: {
      bitrateKbps: media?.bitrate,
      mimeType: media?.container ? `audio/${media.container}` : undefined,
    },
  };
}
