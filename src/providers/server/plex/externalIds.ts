/**
 * MusicBrainz id extraction shared by the Plex mappers.
 *
 * Plex has no dedicated MusicBrainz field the way Subsonic/MediaBrowser do;
 * an agent that resolved one records it as a `mbid://<uuid>` entry in the
 * item's `Guid` array alongside any other scheme (`plex://`, `tidal://`, …).
 * Absent whenever the section's agent does not do external-id resolution.
 */
import type { PlexMetadata } from './types';

const MBID_SCHEME = 'mbid://';

export function mbidOf(dto: PlexMetadata): string | undefined {
  const guid = dto.Guid?.find(entry => entry.id?.startsWith(MBID_SCHEME));
  const value = guid?.id?.slice(MBID_SCHEME.length);
  return value || undefined;
}
