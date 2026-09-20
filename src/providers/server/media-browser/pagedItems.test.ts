import { fetchAllItems, PAGE_SIZE } from './pagedItems';

type Row = { Id: string };

const rows = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ Id: `item-${from + i}` }));

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

    const items = await fetchAllItems<Row>(client, '/Items?x=1');

    expect(items).toHaveLength(12);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('appends the paging parameters to a path that already has a query', async () => {
    const { client, request } = serverWith(3);

    await fetchAllItems<Row>(client, '/Items?IncludeItemTypes=Audio&Recursive=true');

    expect(request.mock.calls[0][0]).toBe(
      `/Items?IncludeItemTypes=Audio&Recursive=true&StartIndex=0&Limit=${PAGE_SIZE}`
    );
  });

  it('walks every page, in order, with no gaps or repeats', async () => {
    const total = PAGE_SIZE * 2 + 137;
    const { client, request } = serverWith(total);

    const items = await fetchAllItems<Row>(client, '/Items?x=1');

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

    const items = await fetchAllItems<Row>(client, '/Items?x=1');

    expect(items).toHaveLength(PAGE_SIZE * 2);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('still terminates on an exact multiple when the server omits TotalRecordCount', async () => {
    const { client, request } = serverWith(PAGE_SIZE, { totalRecordCount: false });

    const items = await fetchAllItems<Row>(client, '/Items?x=1');

    expect(items).toHaveLength(PAGE_SIZE);
    // One full page, then an empty one that proves there is no more.
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('gives up on a server that ignores Limit, rather than asking forever', async () => {
    // It handed back the whole library in one go, so there is nothing more to
    // ask for; asking again would return the same rows.
    const request = jest.fn(async () => ({ Items: rows(0, PAGE_SIZE * 3) }));

    const items = await fetchAllItems<Row>({ request } as never, '/Items?x=1');

    expect(items).toHaveLength(PAGE_SIZE * 3);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('treats a missing Items array as the end, not as a crash', async () => {
    const request = jest.fn(async () => ({}));

    await expect(fetchAllItems<Row>({ request } as never, '/Items?x=1')).resolves.toEqual([]);
  });

  it('trusts a short page over a TotalRecordCount that claims more', async () => {
    // Seen in the wild: the count includes items the user cannot see.
    const request = jest.fn(async () => ({ Items: rows(0, 5), TotalRecordCount: 9_999 }));

    const items = await fetchAllItems<Row>({ request } as never, '/Items?x=1');

    expect(items).toHaveLength(5);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
