/**
 * Plex's `/:/` URL commands, and the rule all of them share.
 *
 * These are not REST resources. A `/:/` call is an instruction handed to the
 * plugin that owns the item, and the plugin is named in `identifier`. Without
 * it the server has nothing to hand the key to — and it does not say so: it
 * answers `200` with an empty body, which this client reads as success.
 *
 * That is why these faults survive. A Plex write that is ignored is
 * indistinguishable from one that worked, from the client's side, and the only
 * evidence is that the thing you asked for never happens.
 *
 * `key` is the bare rating key here, as it is on `/:/scrobble` — the metadata
 * path form belongs to `/:/timeline` alone. The two spellings are why a
 * path-shaped `key` looked reasonable in calls where it does not work.
 */

/**
 * The plugin `/:/` calls are scoped to. Yuzic only ever addresses items in the
 * music library, which is the same provider as the rest of the Plex library.
 */
export const LIBRARY_IDENTIFIER = 'com.plexapp.plugins.library';

/**
 * Setting a track's rating — which on Plex is also how a favourite is stored.
 *
 * Plex has one number per item, so this app spends it on the favourite:
 * `userRating = 10` is starred and `0` is not, which is why the ratings
 * surface stays hidden on Plex rather than competing for the same field.
 *
 * This call carried the metadata path under `key` and no `identifier` at all,
 * so the server accepted and discarded every star. Favourites are *read* back
 * with `userRating=10`, so the list could only ever come back empty — the
 * feature looked present and did nothing, in both directions, for as long as
 * it has existed.
 */
export function ratePath(ratingKey: string, rating: number): string {
  const params = new URLSearchParams({
    key: ratingKey,
    identifier: LIBRARY_IDENTIFIER,
    rating: String(rating),
  });
  return `/:/rate?${params.toString()}`;
}
