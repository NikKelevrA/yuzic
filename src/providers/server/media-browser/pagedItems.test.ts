import { fetchAllItems, PAGE_SIZE } from './pagedItems';

type Row = { Id: string };

const rows = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ Id: `item-${from + i}` }));

/** The walk itself is what most of these test, so they hand back the row. */
const same = (row: Row): Row => row;

/** A client whose `request` answers from a fixed list, honouring the paging
 *  parameters the way Jellyfin does. */
function serverWith(total: number, opts: { totalRecordCount?: boolean } = {}) {
  const request = jest.fn(async (path: string) => {
    const start = Number(/StartIndex=(\d+)/.exec(path)?.[1] ?? 0);
    const limit = Number(/Limit=(\d+)/.exec(path)?.[1] ?? total);
    return {
      Items: rows(start, Math.max(0, Math.min(limit, total - start))),
      ...(opts.totalRecordCount === false ? {} : { TotalRecordCount: total }),
    };
  });
  return { client: { request } as never, request };
}

describe('fetchAllItems', () => {
  it('returns a single short page without asking again', async () => {
    const { client, request } = serverWith(12);

    const items = await fetchAllItems<Row, Row>(client, '/Items?x=1', same);

    expect(items).toHaveLength(12);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('appends the paging parameters to a path that already has a query', async () => {
    const { client, request } = serverWith(3);

    await fetchAllItems<Row, Row>(client, '/Items?IncludeItemTypes=Audio&Recursive=true', same);

    expect(request.mock.calls[0][0]).toBe(
      `/Items?IncludeItemTypes=Audio&Recursive=true&StartIndex=0&Limit=${PAGE_SIZE}`
    );
  });

  it('walks every page, in order, with no gaps or repeats', async () => {
    const total = PAGE_SIZE * 2 + 137;
    const { client, request } = serverWith(total);

    const items = await fetchAllItems<Row, Row>(client, '/Items?x=1', same);

    expect(items).toHaveLength(total);
    expect(request).toHaveBeenCalledTimes(3);
    // The thing that actually matters: every item exactly once, in order.
    expect(new Set(items.map(i => i.Id)).size).toBe(total);
    expect(items[0].Id).toBe('item-0');
    expect(items[total - 1].Id).toBe(`item-${total - 1}`);
  });

  it('stops on an exact multiple of the page size without losing the tail', async () => {
    // The off-by-one that drops a library's last page: a full final page looks
    // identical to "there is more", so this leans on TotalRecordCount.
    const { client, request } = serverWith(PAGE_SIZE * 2);

    const items = await fetchAllItems<Row, Row>(client, '/Items?x=1', same);

    expect(items).toHaveLength(PAGE_SIZE * 2);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('still terminates on an exact multiple when the server omits TotalRecordCount', async () => {
    const { client, request } = serverWith(PAGE_SIZE, { totalRecordCount: false });

    const items = await fetchAllItems<Row, Row>(client, '/Items?x=1', same);

    expect(items).toHaveLength(PAGE_SIZE);
    // One full page, then an empty one that proves there is no more.
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('gives up on a server that ignores Limit, rather than asking forever', async () => {
    // It handed back the whole library in one go, so there is nothing more to
    // ask for; asking again would return the same rows.
    const request = jest.fn(async () => ({ Items: rows(0, PAGE_SIZE * 3) }));

    const items = await fetchAllItems<Row, Row>({ request } as never, '/Items?x=1', same);

    expect(items).toHaveLength(PAGE_SIZE * 3);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('treats a missing Items array as the end, not as a crash', async () => {
    const request = jest.fn(async () => ({}));

    await expect(fetchAllItems<Row, Row>({ request } as never, '/Items?x=1', same)).resolves.toEqual([]);
  });

  it('trusts a short page over a TotalRecordCount that claims more', async () => {
    // Seen in the wild: the count includes items the user cannot see.
    const request = jest.fn(async () => ({ Items: rows(0, 5), TotalRecordCount: 9_999 }));

    const items = await fetchAllItems<Row, Row>({ request } as never, '/Items?x=1', same);

    expect(items).toHaveLength(5);
    expect(request).toHaveBeenCalledTimes(1);
  });

  describe('mapping', () => {
    it('maps each page before asking for the next', async () => {
      // The reason the mapper is here at all: a page's DTOs must be droppable
      // before the next request, rather than all of them living to the end.
      const { request } = serverWith(PAGE_SIZE * 2 + 1);
      const order: string[] = [];
      const request2 = jest.fn(async (path: string) => {
        order.push('request');
        return request(path);
      });

      await fetchAllItems<Row, string>({ request: request2 } as never, '/Items?x=1', row => {
        order.push('map');
        return row.Id;
      });

      // request, then that page's maps, then the next request.
      expect(order[0]).toBe('request');
      expect(order[1]).toBe('map');
      expect(order[PAGE_SIZE + 1]).toBe('request');
    });

    it('returns what the mapper made, not the rows', async () => {
      const { client } = serverWith(3);

      const ids = await fetchAllItems<Row, string>(client, '/Items?x=1', row => row.Id);

      expect(ids).toEqual(['item-0', 'item-1', 'item-2']);
    });

    it('drops the items the mapper rejects', async () => {
      const { client } = serverWith(10);

      const kept = await fetchAllItems<Row, Row>(client, '/Items?x=1', row =>
        row.Id.endsWith('0') ? row : null
      );

      expect(kept.map(r => r.Id)).toEqual(['item-0']);
    });

    it('keeps walking when the mapper drops a whole page', async () => {
      // A full page that maps to nothing still means "there is more". Counting
      // the kept rows instead of the received ones would end the walk here and
      // silently lose the rest of the library.
      const total = PAGE_SIZE * 2 + 4;
      const { client, request } = serverWith(total);

      const kept = await fetchAllItems<Row, Row>(client, '/Items?x=1', row =>
        Number(row.Id.slice('item-'.length)) >= PAGE_SIZE ? row : null
      );

      expect(request).toHaveBeenCalledTimes(3);
      expect(kept).toHaveLength(total - PAGE_SIZE);
    });
  });
});
