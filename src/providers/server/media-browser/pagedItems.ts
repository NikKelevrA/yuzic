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
 */
export async function fetchAllItems<T>(
  client: Pick<MediaBrowserClient, 'request'>,
  path: string
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const startIndex = page * PAGE_SIZE;
    const raw = await client.request<MediaBrowserItemsResponse<T>>(
      `${path}&StartIndex=${startIndex}&Limit=${PAGE_SIZE}`
    );
    const items = raw?.Items ?? [];

    // Appended one at a time rather than spread: a server that ignores `Limit`
    // hands back the whole library at once, and `push(...items)` with a
    // hundred thousand arguments overflows the call stack.
    for (const item of items) all.push(item);

    // A server that ignored `Limit` has already given us everything there is,
    // so asking again would return the same rows forever.
    if (items.length >= PAGE_SIZE + 1) return all;
    if (items.length < PAGE_SIZE) return all;

    const total = raw?.TotalRecordCount;
    if (typeof total === 'number' && all.length >= total) return all;
  }

  return all;
}
