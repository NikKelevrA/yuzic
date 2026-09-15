import { coverOrMissing, type CoverSource, type CoverSubject } from '@/domain/entities/Cover';

/**
 * Deezer gives every artist and album a picture URL, including the ones it
 * has no picture for: those have an empty image hash (`/images/artist//…`),
 * which serves a grey silhouette. That is no picture, and saying so is what
 * lets a backup fill it.
 */
const EMPTY_IMAGE_HASH = /\/images\/(artist|cover)\/\//;

/** The first real image URL, largest first, or a gap naming who it is of. */
export function imageCover(
  urls: (string | null | undefined)[],
  subject: CoverSubject | undefined
): CoverSource {
  const url = urls.find(candidate => candidate && !EMPTY_IMAGE_HASH.test(candidate));
  return coverOrMissing(url ? { kind: 'url', url } : { kind: 'none' }, subject);
}
