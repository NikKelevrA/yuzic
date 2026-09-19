import { monitorArtist } from './monitor';
import type { LidarrClient } from '../client';

/**
 * Following an artist is the artist want's Get. The two things worth holding
 * still are that it resolves the *same* artist an album request would, and
 * that it does not turn one tap into a discography's worth of downloads.
 */

type Routes = {
  artists?: unknown[];
  lookup?: unknown[];
  rootFolders?: { path: string }[];
  created?: { id: number };
};

function fakeClient(routes: Routes) {
  const posted: { path: string; body: any }[] = [];
  const sent: { path: string; method: string; body: any }[] = [];
  const request = jest.fn(async (path: string, options?: { method?: string; body?: string }) => {
    if (options?.method) {
      sent.push({ path, method: options.method, body: JSON.parse(options.body ?? '{}') });
    }
    if (options?.method === 'POST') {
      posted.push({ path, body: JSON.parse(options.body ?? '{}') });
      return routes.created ?? { id: 42 };
    }
    if (path.startsWith('/artist/lookup')) return routes.lookup ?? [];
    if (path === '/artist') return routes.artists ?? [];
    if (path === '/rootfolder') return routes.rootFolders ?? [{ path: '/music' }];
    return [];
  });
  return { client: { request } as unknown as LidarrClient, request, posted, sent };
}

const IVE = {
  artistName: 'IVE',
  foreignArtistId: 'b2f2216a-d7a9-4ce0-8b8f-f494d9a8c196',
};

describe('monitorArtist', () => {
  it('resolves an artist Lidarr already holds without a metadata lookup', async () => {
    const { client, request } = fakeClient({ artists: [{ ...IVE, id: 7 }] });

    const result = await monitorArtist(client, { name: 'IVE' });

    expect(result).toEqual({ success: true, artistId: 7, created: false, searchStarted: false });
    expect(request.mock.calls.some(([path]) => String(path).startsWith('/artist/lookup'))).toBe(false);
  });

  it('adds an artist it has never heard of, and follows them from now on', async () => {
    const { client, posted } = fakeClient({ artists: [], lookup: [IVE], created: { id: 42 } });

    const result = await monitorArtist(client, { name: 'IVE' });

    expect(result).toEqual({ success: true, artistId: 42, created: true, searchStarted: false });
    expect(posted).toHaveLength(1);
    expect(posted[0].body.monitored).toBe(true);
  });

  it('does not go looking for the back catalogue — a Get is not an auto-download', async () => {
    // One tap must not become every album the artist ever released. They are
    // followed for what comes next; existing records are had one Get at a time.
    const { client, posted } = fakeClient({ artists: [], lookup: [IVE] });

    await monitorArtist(client, { name: 'IVE' });

    expect(posted[0].body.addOptions).toEqual({ searchForMissingAlbums: false, monitor: 'future' });
  });

  it('follows an artist Lidarr holds but is not watching', async () => {
    // This returned early without touching `monitored`, so a Get on an artist
    // Lidarr already knew reported success and changed nothing at all.
    const { client, sent } = fakeClient({ artists: [{ ...IVE, id: 7, monitored: false }] });

    await monitorArtist(client, { name: 'IVE' });

    const put = sent.find(r => r.method === 'PUT');
    expect(put).toMatchObject({ path: '/artist/7', body: { monitored: true } });
  });

  it('leaves an artist it is already watching alone', async () => {
    const { client, sent } = fakeClient({ artists: [{ ...IVE, id: 7, monitored: true }] });

    await monitorArtist(client, { name: 'IVE' });

    expect(sent.some(r => r.method === 'PUT')).toBe(false);
  });

  it('asks for the back catalogue only when told to', async () => {
    const { client, posted } = fakeClient({ artists: [], lookup: [IVE] });

    await monitorArtist(client, { name: 'IVE', monitor: 'all', search: true });

    expect(posted[0].body.addOptions).toEqual({ searchForMissingAlbums: true, monitor: 'all' });
  });

  it('does not command a second search for an artist it just added', async () => {
    // `addOptions.searchForMissingAlbums` has already covered exactly the
    // albums `monitor` flagged; commanding again would sweep them twice.
    const { client, posted } = fakeClient({ artists: [], lookup: [IVE] });

    const result = await monitorArtist(client, { name: 'IVE', monitor: 'all', search: true });

    expect(posted.filter(p => p.path === '/command')).toHaveLength(0);
    expect(result).toMatchObject({ created: true, searchStarted: true });
  });

  it('commands a search for an artist Lidarr already had, where add options cannot reach', async () => {
    const { client, posted } = fakeClient({ artists: [{ ...IVE, id: 7, monitored: true }] });

    const result = await monitorArtist(client, { name: 'IVE', monitor: 'all', search: true });

    expect(posted).toContainEqual({ path: '/command', body: { name: 'ArtistSearch', artistId: 7 } });
    expect(result).toMatchObject({ created: false, searchStarted: true });
  });

  it('prefers the MBID, so it follows the same artist an album request would', async () => {
    const other = { artistName: 'IVE', foreignArtistId: 'a92e9703-929f-45bb-aa78-b78dfde731a4' };
    const { client } = fakeClient({ artists: [{ ...other, id: 3 }, { ...IVE, id: 9 }] });

    const result = await monitorArtist(client, { name: 'IVE', mbid: IVE.foreignArtistId });

    expect(result).toEqual({ success: true, artistId: 9, created: false, searchStarted: false });
  });

  it('refuses rather than guessing when the name matches several artists', async () => {
    const { client, posted } = fakeClient({
      artists: [],
      lookup: [IVE, { artistName: 'IVE', foreignArtistId: 'a760a4d1-1258-4833-9ed5-fa083902d907' }],
    });

    const result = await monitorArtist(client, { name: 'IVE' });

    expect(result).toEqual({
      success: false,
      code: 'artist_identity_ambiguous',
      message: expect.stringContaining('artist_identity_ambiguous'),
    });
    expect(posted).toHaveLength(0);
  });

  it('refuses an empty name without calling Lidarr at all', async () => {
    const { client, request } = fakeClient({});

    const result = await monitorArtist(client, { name: '  ' });

    expect(result).toMatchObject({ success: false });
    expect(request).not.toHaveBeenCalled();
  });
});
