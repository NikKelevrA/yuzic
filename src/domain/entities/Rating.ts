/**
 * The five-star scale, and the two ways a number becomes one.
 *
 * Here rather than beside the UI because both ends need it: a provider
 * turning whatever its server reported into the scale, and the control the
 * user taps turning a star index back into a value to write. Two copies of
 * "clamp between nought and five" is how a Plex rating of 10 reaches a
 * five-star row and draws nothing.
 */

/** Five stars. Zero is a sixth state — "not rated" — rather than a sixth star. */
export const RATING_MAX = 5

/**
 * The nearest value on the scale.
 *
 * Rounds rather than truncates, because the servers that store half-stars
 * hand back the halves: Plex keeps a rating out of ten, and 7 is a track the
 * user gave three and a half stars to. Three and a half of five stars reads
 * as four, not three.
 */
export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.round(value), 0), RATING_MAX)
}

/**
 * What an origin reported, on the scale — or undefined where it said nothing.
 *
 * The distinction is the whole point of the optional field on the entity:
 * absent means the server does not carry ratings or did not include one, and
 * zero means it does and the user has not given this a rating. Collapsing
 * them makes every list on a server without ratings sort as a run of ties.
 */
export function reportedRating(raw: number | null | undefined): number | undefined {
  return raw === null || raw === undefined ? undefined : clampRating(raw)
}
