type TrackRequest = { title: string; artist: string };

type Result =
  | { success: true }
  | { success: false; code?: string; message: string };

/**
 * An album, for a downloader that takes tracks and nothing else.
 *
 * SoulSync's only way in is a free-text request for one track, so it was left
 * off every album's Get sheet — while slskd and Lidarr sat there — even though
 * an album is only its tracks. It gets the album as those tracks now, asked for
 * one at a time in running order, so its pipeline is not flooded with a whole
 * album's searches at once.
 *
 * Every track is attempted even after one fails. All of them failing reports
 * the first failure's own code; some failing reports `some_tracks_failed`,
 * because most of the album is on its way and the message should say only
 * part of it is not.
 */
export async function downloadAlbumByTracks<Config>(
  downloadTrack: (config: Config, req: TrackRequest) => Promise<Result>,
  config: Config,
  tracks: TrackRequest[],
  /**
   * Told after each track, so a caller can say how far along it is.
   *
   * Worth having because this loop is the slow one in the app: every track is
   * a round trip and they are deliberately not sent at once, so an album is as
   * many waits as it has songs. Without this the only honest thing to show was
   * a spinner, which is what kept the sheet on screen for the whole run.
   */
  onProgress?: (done: number, total: number) => void
): Promise<Result> {
  if (tracks.length === 0) {
    return { success: false, code: 'no_tracks', message: 'No tracks to request for this album' };
  }

  const failures: Result[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const result = await downloadTrack(config, tracks[i]).catch(
      (error: unknown): Result => ({ success: false, message: (error as Error)?.message ?? 'Track request failed' })
    );
    if (!result.success) failures.push(result);
    // Attempted, not succeeded: the count is how far through the album we are,
    // and a track that failed is still one the user no longer waits on.
    onProgress?.(i + 1, tracks.length);
  }

  if (failures.length === 0) return { success: true };
  if (failures.length === tracks.length) return failures[0];
  return {
    success: false,
    code: 'some_tracks_failed',
    message: `${failures.length} of ${tracks.length} tracks could not be requested`,
  };
}
