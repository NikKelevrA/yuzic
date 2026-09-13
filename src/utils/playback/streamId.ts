import type { Song } from '@/domain/entities/Song';

/**
 * The catalog id addresses metadata; a provider may expose playback through a
 * different id. Keep this decision at the Song boundary so phone playback,
 * downloads, and vehicle surfaces cannot silently disagree.
 */
export function streamSourceId(song: Pick<Song, 'nativeId' | 'streamId'>): string {
  return song.streamId ?? song.nativeId;
}
