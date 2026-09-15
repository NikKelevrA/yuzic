import { coverBackupFor } from './coverBackups';
import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import { resolveDeezerAlbum, resolveDeezerArtistByName } from '@/providers/integration/deezer';

jest.mock('@/providers/http/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
jest.mock('@/providers/integration/deezer', () => ({
  resolveDeezerArtistByName: jest.fn(),
  resolveDeezerAlbum: jest.fn(),
}));

const mockedFetch = fetchWithTimeout as jest.Mock;

const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as unknown as Response;

const caa = coverBackupFor('coverartarchive')!;
const deezer = coverBackupFor('deezer')!;

afterEach(() => jest.resetAllMocks());

describe('Cover Art Archive backup', () => {
  it('only answers for an album with a MusicBrainz id', () => {
    expect(caa.handles({ kind: 'album', title: 'Kid A', artistName: 'Radiohead', mbid: 'm' })).toBe(true);
    expect(caa.handles({ kind: 'album', title: 'Kid A', artistName: 'Radiohead' })).toBe(false);
    expect(caa.handles({ kind: 'artist', name: 'Radiohead', mbid: 'm' })).toBe(false);
  });

  it('asks the stated kind of id first, then the other, and names the one that had a front cover', async () => {
    mockedFetch
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200, { images: [{ front: false }, { front: true }] }));

    const cover = await caa.lookup({ kind: 'album', title: 'Kid A', artistName: 'Radiohead', mbid: 'abc', mbidType: 'release-group' });

    expect(mockedFetch.mock.calls.map(([path]) => path)).toEqual([
      'https://coverartarchive.org/release-group/abc',
      'https://coverartarchive.org/release/abc',
    ]);
    expect(cover).toEqual({ kind: 'coverartarchive', mbid: 'abc', mbidType: 'release' });
  });

  it('starts with the release when the server said release', async () => {
    mockedFetch.mockResolvedValueOnce(response(200, { images: [{ front: true }] }));

    await caa.lookup({ kind: 'album', title: 'Kid A', artistName: 'Radiohead', mbid: 'abc', mbidType: 'release' });

    expect(mockedFetch.mock.calls[0][0]).toBe('https://coverartarchive.org/release/abc');
  });

  it('is a definite "none" when neither kind has a front cover', async () => {
    mockedFetch.mockResolvedValueOnce(response(200, { images: [{ front: false }] })).mockResolvedValueOnce(response(400));

    await expect(caa.lookup({ kind: 'album', title: 'Kid A', artistName: 'Radiohead', mbid: 'abc' })).resolves.toBeNull();
  });

  it('throws when the archive could not answer, so the miss is not remembered', async () => {
    mockedFetch.mockResolvedValueOnce(response(503));

    await expect(caa.lookup({ kind: 'album', title: 'Kid A', artistName: 'Radiohead', mbid: 'abc' })).rejects.toThrow('503');
  });
});

describe('Deezer backup', () => {
  it("uses an artist's photo only when the search found the same name", async () => {
    (resolveDeezerArtistByName as jest.Mock)
      .mockResolvedValueOnce({ name: 'bibio ', cover: { kind: 'url', url: 'bibio.jpg' } })
      .mockResolvedValueOnce({ name: 'Bibio Tribute Band', cover: { kind: 'url', url: 'other.jpg' } })
      .mockResolvedValueOnce({ name: 'Bibio', cover: { kind: 'none' } });

    await expect(deezer.lookup({ kind: 'artist', name: 'Bibio' })).resolves.toEqual({ kind: 'url', url: 'bibio.jpg' });
    await expect(deezer.lookup({ kind: 'artist', name: 'Bibio' })).resolves.toBeNull();
    await expect(deezer.lookup({ kind: 'artist', name: 'Bibio' })).resolves.toBeNull();
  });

  it("uses an album's cover only when both the title and the artist match", async () => {
    (resolveDeezerAlbum as jest.Mock)
      .mockResolvedValueOnce({ title: 'Kid A', artist: { name: 'Radiohead' }, cover: { kind: 'url', url: 'kida.jpg' } })
      .mockResolvedValueOnce({ title: 'Kid A Mnesia', artist: { name: 'Radiohead' }, cover: { kind: 'url', url: 'other.jpg' } });

    const subject = { kind: 'album' as const, title: 'Kid A', artistName: 'Radiohead' };
    await expect(deezer.lookup(subject)).resolves.toEqual({ kind: 'url', url: 'kida.jpg' });
    await expect(deezer.lookup(subject)).resolves.toBeNull();
    expect(resolveDeezerAlbum).toHaveBeenCalledWith('Radiohead', 'Kid A');
  });

  it('lets a failed search throw rather than read as "no picture"', async () => {
    (resolveDeezerArtistByName as jest.Mock).mockRejectedValueOnce(new Error('quota'));

    await expect(deezer.lookup({ kind: 'artist', name: 'Bibio' })).rejects.toThrow('quota');
  });
});

it('has no backup for a source that supplies no pictures', () => {
  expect(coverBackupFor('lrclib')).toBeNull();
});
