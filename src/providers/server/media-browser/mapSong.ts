/**
 * MediaBrowser (Jellyfin/Emby) song DTO -> domain Song.
 *
 * No stream URL is produced here. A credentialled URL is not safe to persist
 * and goes stale with the session; the entity carries the id a stream can be
 * built from, and building one is the player boundary's job.
 */
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { CoverSource } from '@/domain/entities/Cover';
import { buildSongCover, type MediaBrowserBrand } from './brand';
import { normalizeGenres } from './utils/normalizeGenres';
import { albumRef, artistRef } from './mapRefs';
import type { MediaBrowserItem } from './types';

/** MediaBrowser reports duration in 100ns ticks, not seconds. */
const TICKS_PER_SECOND = 10_000_000;

function externalIdsOf(dto: MediaBrowserItem): ExternalIds {
  const trackMbid = dto.ProviderIds?.MusicBrainzTrack;
  return trackMbid ? { mbid: trackMbid } : {};
}

interface MapSongContext {
  provenance: Provenance;
  brand: MediaBrowserBrand;
  /** The cover to use where the song carries none of its own — usually the album's. */
  cover?: CoverSource;
  /** Album title, when mapping from an album payload that knows it. */
  albumTitle?: string;
  /** Album id, when the song DTO omits it. */
  albumId?: string;
}

export function mapSong(dto: MediaBrowserItem, context: MapSongContext): Song {
  const { provenance, brand } = context;
  const nativeId = dto.Id ?? '';
  const albumId = dto.AlbumId ?? context.albumId;
  const cover = context.cover ?? buildSongCover(brand, dto.Id, albumId, dto.AlbumPrimaryImageTag);
  const artistItem = dto.ArtistItems?.[0];
  const mediaSource = dto.MediaSources?.[0];
  const audioStream = mediaSource?.MediaStreams?.find(stream => stream.Type === 'Audio');
  const ticks = dto.RunTimeTicks ?? mediaSource?.RunTimeTicks ?? 0;

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: externalIdsOf(dto),
    libraryState: 'in-library',
    title: dto.Name ?? 'Unknown',
    artist: artistRef(provenance, artistItem?.Id, artistItem?.Name ?? dto.AlbumArtist),
    album: albumRef(provenance, albumId, context.albumTitle, cover),
    cover,
    durationSeconds: Math.round(ticks / TICKS_PER_SECOND),
    // Everything reachable through the library's song endpoints is a song;
    // radio and podcast entries are mapped by their own endpoints.
    contentKind: 'song',
    discNumber: dto.ParentIndexNumber,
    trackNumber: dto.IndexNumber,
    year: dto.ProductionYear,
    genres: normalizeGenres(dto.Genres) ?? [],
    addedAt: dto.DateCreated ? Date.parse(dto.DateCreated) || undefined : undefined,
    serverPlayCount: dto.UserData?.PlayCount,
    serverLastPlayedAt: dto.UserData?.LastPlayedDate
      ? Date.parse(dto.UserData.LastPlayedDate) || undefined
      : undefined,
    audio: {
      bitrateKbps: audioStream?.BitRate ?? mediaSource?.Bitrate,
      sampleRateHz: audioStream?.SampleRate,
      bitsPerSample: audioStream?.BitDepth,
      mimeType: mediaSource?.Container ? `audio/${mediaSource.Container}` : undefined,
    },
  };
}
