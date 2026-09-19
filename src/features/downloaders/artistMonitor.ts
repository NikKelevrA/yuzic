/**
 * What it means to ask a downloader for an artist.
 *
 * Its own module because the registry that carries the rest of the contract had
 * reached the size the file-shape gate holds it to, and because these two are
 * the request the review sheet exists to compose — a name is what you ask for,
 * but the policy beside it is what the ask actually costs.
 */

/**
 * Which of an artist's releases the downloader should watch.
 *
 * Lidarr's own set, kept whole rather than narrowed to the two that seemed
 * useful: a collection manager's monitoring options are the vocabulary its
 * users already have, and an app that offers three of seven is one that has to
 * be argued with later about the missing four.
 */
export type ArtistMonitorPolicy =
  | 'all'
  | 'future'
  | 'missing'
  | 'existing'
  | 'first'
  | 'latest'
  | 'none';

/**
 * An artist to follow, rather than a release to fetch.
 *
 * The MBID is what actually identifies them where the catalogue supplied one;
 * the name is the fallback and the thing a lookup is spelled with.
 *
 * `monitor` and `search` come from the review sheet rather than from a default
 * here. They are one decision in two halves: a search only looks at what is
 * being watched, so the pair is the difference between following someone from
 * now on and asking for everything they have ever released.
 */
export type ArtistMonitorRequest = {
  name: string;
  mbid?: string;
  monitor?: ArtistMonitorPolicy;
  search?: boolean;
  qualityProfileId?: number;
};
