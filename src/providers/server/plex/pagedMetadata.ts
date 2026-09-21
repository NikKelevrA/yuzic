import type { PlexClient } from './client';
import type { PlexMetadata, PlexResponse } from './types';

/**
 * How many rows one request asks Plex for.
 *
 * Plex returns a page even when a catalog has thousands of entries: its API
 * wants `X-Plex-Container` headers rather than an implicit unlimited list, so
 * a caller that sends none silently ships a first-page-only view.
 */
const PAGE_SIZE = 200;

/** The rows in a Plex response, or none. */
export function metadata(response: PlexResponse): PlexMetadata[] {
  return response.MediaContainer?.Metadata ?? [];
}

/**
 * Every row behind a Plex listing, a page at a time.
 *
 * **`map` runs per page, and that is the point.** This used to accumulate the
 * raw `PlexMetadata` for a whole library and hand it back for the caller to
 * map afterwards, so at the end of a walk every DTO and every entity was alive
 * at once. Measured on the matching path for Jellyfin, at 45,000 tracks that
 * is 85 MB of DTOs held for nothing.
 *
 * A `map` returning `null` drops the row, which is how the track walk skips
 * the entries Plex mixes into a section.
 */
export async function pagedMetadata<T>(
  client: PlexClient,
  path: string,
  map: (item: PlexMetadata) => T | null
): Promise<T[]> {
  const result: T[] = [];
  let received = 0;
  let start = 0;

  while (true) {
    const response = await client.request<PlexResponse>(path, {
      headers: {
        'X-Plex-Container-Start': String(start),
        'X-Plex-Container-Size': String(PAGE_SIZE),
      },
    });
    const page = metadata(response);

    // Appended one at a time rather than spread: a server that ignores the
    // container headers hands back the whole library, and `push(...page)` with
    // ninety thousand arguments overflows the call stack.
    for (const entry of page) {
      const mapped = map(entry);
      if (mapped !== null) result.push(mapped);
    }
    received += page.length;

    // Counted from what arrived rather than from what was kept: a `map` that
    // drops rows would otherwise look like the end of the library.
    const total = Number(response.MediaContainer?.totalSize);
    if (!page.length || !Number.isFinite(total) || received >= total) return result;

    start += page.length;
  }
}
