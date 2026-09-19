/**
 * What a thing's rating is right now, out of the two places it can come from.
 *
 * The catalog's value is what the server last said; the overlay is what this
 * device has written since (see `ratingsSlice`). The overlay wins whenever it
 * exists, which is the part worth naming rather than inlining as `??`: the
 * case it gets right is a rating the user has just *cleared*, where the
 * overlay is 0 and every shorthand that treats 0 as "nothing here" falls back
 * to the catalog's stale three stars and puts them straight back on screen.
 */
export function effectiveRating(
  reported: number | undefined,
  override: number | undefined
): number | undefined {
  return override ?? reported
}
