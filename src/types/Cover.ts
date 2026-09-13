export type CoverSource =
  | { kind: 'special'; name: 'heart' }
  | { kind: 'none' }
  | { kind: 'navidrome'; coverArtId: string }
  | { kind: 'jellyfin'; itemId: string; }
  | { kind: 'emby'; itemId: string; tag?: string }
  | { kind: 'plex'; path: string }
  | { kind: 'url'; url: string }
  | { kind: 'musicbrainz'; releaseGroupId: string }
  | { kind: 'coverartarchive'; mbid: string; mbidType: 'release' | 'release-group' | 'unknown' }
  | { kind: 'commons'; filename: string }

/**
 * Whether a cover source will actually resolve to an image.
 *
 * `{ kind: 'none' }` is a value, not an absence, so `cover ?? fallback` never
 * falls through it — a caller chaining fallbacks has to ask. Getting this
 * wrong renders a broken image instead of the fallback that was written.
 */
export const hasCoverImage = (cover: CoverSource | null | undefined): boolean =>
  Boolean(cover) && cover!.kind !== 'none';

/** The first cover in preference order that will actually resolve. */
export const firstResolvableCover = (
  ...covers: (CoverSource | null | undefined)[]
): CoverSource | null => covers.find(hasCoverImage) ?? null;

export const COVER_PX: Record<'thumb' | 'grid' | 'detail' | 'background', number> = {
  thumb: 96,
  grid: 420,
  detail: 1200,
  background: 1800,
};
