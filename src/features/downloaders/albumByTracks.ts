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
  tracks: TrackRequest[]
): Promise<Result> {
  if (tracks.length === 0) {
    return { success: false, code: 'no_tracks', message: 'No tracks to request for this album' };
  }

  const failures: Result[] = [];
  for (const track of tracks) {
    const result = await downloadTrack(config, track).catch(
      (error: unknown): Result => ({ success: false, message: (error as Error)?.message ?? 'Track request failed' })
    );
    if (!result.success) failures.push(result);
  }

  if (failures.length === 0) return { success: true };
  if (failures.length === tracks.length) return failures[0];
  return {
    success: false,
    code: 'some_tracks_failed',
    message: `${failures.length} of ${tracks.length} tracks could not be requested`,
  };
}
