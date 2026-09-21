/**
 * The two properties the paged walk exists for.
 *
 * Both are invisible from the adapter's own tests, which only ever check that
 * every row comes back: a version that kept every page's DTOs until the end
 * and a version that stopped a page early would both pass those.
 */
import { pagedMetadata } from './pagedMetadata';
import type { PlexClient } from './client';
import type { PlexMetadata, PlexResponse } from './types';

/** A client that answers from a list of pages and logs when it was asked. */
function fakeClient(pages: PlexResponse[], log: string[]): PlexClient {
  let call = 0;
  return {
    request: async <T>(_path: string, init: RequestInit = {}): Promise<T> => {
      const start = (init.headers as Record<string, string> | undefined)?.['X-Plex-Container-Start'];
      log.push(`request ${start}`);
      return pages[call++] as unknown as T;
    },
  } as unknown as PlexClient;
}

function page(totalSize: number, rows: PlexMetadata[]): PlexResponse {
  return { MediaContainer: { totalSize, Metadata: rows } } as PlexResponse;
}

describe('the Plex paged walk', () => {
  it('maps a page before it asks for the next one', async () => {
    // What this rules out is holding the raw DTOs for a whole library and
    // mapping at the end: there, every `map` call would land after the last
    // request rather than interleaved with them.
    const log: string[] = [];
    const client = fakeClient(
      [page(3, [{ title: 'a' }, { title: 'b' }]), page(3, [{ title: 'c' }])],
      log
    );

    const titles = await pagedMetadata(client, '/all', dto => {
      log.push(`map ${dto.title}`);
      return dto.title ?? null;
    });

    expect(titles).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['request 0', 'map a', 'map b', 'request 2', 'map c']);
  });

  it('counts what arrived, not what it kept, so a filtering map cannot add a round trip', async () => {
    // `tracks.list` drops the rows Plex mixes into a music section that are
    // not tracks. Counting kept rows would leave the walk short of
    // `totalSize` forever, asking for a page past the end of every library.
    const log: string[] = [];
    const client = fakeClient(
      [
        page(3, [{ type: 'track', title: 'a' }, { type: 'clip', title: 'skip me' }]),
        page(3, [{ type: 'track', title: 'c' }]),
        page(3, []),
      ],
      log
    );

    const kept = await pagedMetadata(client, '/all', dto =>
      dto.type === 'track' ? (dto.title ?? null) : null
    );

    expect(kept).toEqual(['a', 'c']);
    expect(log).toEqual(['request 0', 'request 2']);
  });
});
