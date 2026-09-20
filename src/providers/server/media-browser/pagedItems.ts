import type { MediaBrowserClient } from './client';
import type { MediaBrowserItemsResponse } from './types';

/**
 * How many items one request asks for.
 *
 * Chosen for the size of the *response*, not the number of requests. A track
 * with the fields the catalog asks for runs about 700 bytes of JSON, so a
 * thousand of them is under a megabyte, which React Native's Android
 * networking layer handles without complaint.
 *
 * Bigger pages are tempting because they mean fewer round trips, and that is
 * exactly the reasoning that produced the bug this exists to fix. Everything
 * here used to be one unbounded request: `IncludeItemTypes=Audio` with
 * `Recursive=true` and no limit, which for a 50,000 track library is a single
 * ~58 MB response. `NetworkingModule` reads a body into a byte array and then
 * hands it to `NetworkEventUtil`, which base64-encodes it again, so that one
 * response cost well over 100 MB against a heap capped at 256 MB. Reported as
 * #266, where it crashed the app on every sync, and reproduced here at 60 MB.
 */
export const PAGE_SIZE = 1000;

/**
 * A ceiling on how many pages one call will walk, so a server that answers
 * oddly cannot spin forever. At {@link PAGE_SIZE} this allows two million
 * items, which is far past any real library and far short of an infinite loop.
 */
const MAX_PAGES = 2000;

/**
 * Every item behind a MediaBrowser listing, a page at a time.
 *
 * `path` must already carry its query string; paging parameters are appended.
 *
 * Stops on the first page that comes back shorter than it asked for, which is
 * the only signal every Jellyfin and Emby build gives reliably.
 * `TotalRecordCount` is used when present, as a second way to stop early, but
 * never as the only one: it is absent from some responses and wrong on others.
 *
 * **`map` runs per page, and that is the point.** It used to return the raw
 * DTOs for the caller to map afterwards, so for a moment every DTO and every
 * entity was alive at once — and a Jellyfin track DTO, with its
 * `MediaSources`, `UserData` and `ArtistItems`, is the larger of the two.
 * Mapping here lets each page's DTOs be collected as soon as the next request
 * goes out, and the peak becomes one page plus the result. A caller that
 * genuinely wants the DTOs passes `item => item` and says so.
 *
 * A `map` returning `null` drops the item, which is how the callers skip a row
 * the server sent without an `Id`.
 */
export async function fetchAllItems<T, R>(
  client: Pick<MediaBrowserClient, 'request'>,
  path: string,
  map: (item: T) => R | null
): Promise<R[]> {
  const all: R[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const startIndex = page * PAGE_SIZE;
    const raw = await client.request<MediaBrowserItemsResponse<T>>(
      `${path}&StartIndex=${startIndex}&Limit=${PAGE_SIZE}`
    );
    const items = raw?.Items ?? [];

    // Appended one at a time rather than spread: a server that ignores `Limit`
    // hands back the whole library at once, and `push(...items)` with a
    // hundred thousand arguments overflows the call stack.
    for (const item of items) {
      const mapped = map(item);
      if (mapped !== null) all.push(mapped);
    }

    // Counted from the page, not from `all`: a `map` that drops rows would
    // otherwise make a full page look short and end the walk early.
    const received = items.length;

    // A server that ignored `Limit` has already given us everything there is,
    // so asking again would return the same rows forever.
    if (received >= PAGE_SIZE + 1) return all;
    if (received < PAGE_SIZE) return all;

    const total = raw?.TotalRecordCount;
    if (typeof total === 'number' && startIndex + received >= total) return all;
  }

  return all;
}
