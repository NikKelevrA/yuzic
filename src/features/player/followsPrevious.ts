/**
 * Whether one queue item runs directly out of the one before it.
 *
 * This is what a gapless-aware crossfade needs and cannot work out for
 * itself. The engine hard-cuts a track whose `Track.followsPrevious` is set
 * rather than fading into it, because a fade across a join the record was
 * mastered with doubles the overlap and sounds worse than the seam it is
 * covering — but all the engine sees is a list of URLs, so the host has to
 * say which joins those are.
 *
 * The signal is the one the app already holds: the two items are the same
 * album, on the same disc, and the second's number is exactly one higher.
 * That is "album joins" as the setting words it, not an attempt to detect a
 * true audio segue — nothing in the catalog says whether a track fades out or
 * runs straight on, and guessing at it from the audio is a different feature.
 *
 * **Unknown is not a match.** If either item is missing an album id or a
 * track number, this answers false: a queue of tracks the server numbered
 * badly would otherwise read as one long segue and lose the crossfade
 * everywhere. Disc numbers are the exception, since a single-disc release
 * usually reports none at all — two undefined discs are the same disc, and a
 * disc on one side only is not.
 */
interface QueuePosition {
  albumId?: string;
  discNumber?: number;
  trackNumber?: number;
}

export function followsPreviousInQueue(
  previous: QueuePosition | undefined,
  current: QueuePosition | undefined
): boolean {
  if (!previous || !current) return false;
  if (!previous.albumId || previous.albumId !== current.albumId) return false;
  if (previous.discNumber !== current.discNumber) return false;
  if (previous.trackNumber === undefined || current.trackNumber === undefined) return false;
  return current.trackNumber === previous.trackNumber + 1;
}
