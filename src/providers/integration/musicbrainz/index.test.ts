jest.mock('@/providers/http/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));

import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import { _resetCache } from '@/providers/http/urlFailover';
import { createMusicbrainzClient } from './index';

const fetchMock = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** Lets every promise that is ready to run do so. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const urlOfCall = (index: number) => String(fetchMock.mock.calls[index][0]);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok({ artists: [] }));
});

describe('MusicBrainz client address', () => {
  it('asks the public server when no address is given', async () => {
    await createMusicbrainzClient().searchArtist('Muse');
    expect(urlOfCall(0).startsWith('https://musicbrainz.org/ws/2/artist?query=')).toBe(true);
  });

  it('asks the public server when the address is blank', async () => {
    await createMusicbrainzClient({ serverUrl: '   ' }).searchArtist('Muse');
    expect(urlOfCall(0).startsWith('https://musicbrainz.org/ws/2/artist?query=')).toBe(true);
  });

  it('adds /ws/2 to the root address of a server of your own', async () => {
    await createMusicbrainzClient({ serverUrl: 'http://nas:5000' }).searchArtist('Muse');
    expect(urlOfCall(0).startsWith('http://nas:5000/ws/2/artist?query=')).toBe(true);
  });

  it.each([
    ['a trailing slash', 'http://nas:5000/'],
    ['several trailing slashes', 'http://nas:5000///'],
    ['surrounding spaces', '  http://nas:5000  '],
    ['a pasted /ws/2', 'http://nas:5000/ws/2'],
    ['a pasted /ws/2/', 'http://nas:5000/ws/2/'],
  ])('reaches the same place with %s', async (_label, serverUrl) => {
    await createMusicbrainzClient({ serverUrl }).getReleaseGroup('abc');
    expect(urlOfCall(0)).toBe('http://nas:5000/ws/2/release-group/abc?inc=artist-credits&fmt=json');
  });

  it('keeps a path the server is served under', async () => {
    await createMusicbrainzClient({ serverUrl: 'https://home.example/musicbrainz/' }).searchArtist('Muse');
    expect(urlOfCall(0).startsWith('https://home.example/musicbrainz/ws/2/artist?query=')).toBe(true);
  });

  it('identifies the app the same way on either server', async () => {
    await createMusicbrainzClient().searchArtist('Muse');
    await createMusicbrainzClient({ serverUrl: 'http://nas:5000' }).searchArtist('Muse');
    const [publicInit, ownInit] = fetchMock.mock.calls.map(call => call[1]);
    expect(publicInit).toEqual(ownInit);
    expect(publicInit).toEqual({
      headers: expect.objectContaining({ 'User-Agent': 'yuzic/1.0 (https://github.com/yuzic)' }),
    });
  });

  it('fails with the status when the server answers with an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(createMusicbrainzClient().searchArtist('Muse')).rejects.toThrow('MusicBrainz 503');
  });
});

describe('MusicBrainz client spacing', () => {
  beforeEach(() => {
    // A request that never finishes, so what runs is only what was allowed to start.
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
  });

  it('queues the public server’s calls behind one another', async () => {
    const client = createMusicbrainzClient();
    void client.searchArtist('a');
    void client.searchArtist('b');
    void client.searchArtist('c');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not queue calls to a server of your own', async () => {
    const client = createMusicbrainzClient({ serverUrl: 'http://nas:5000' });
    void client.searchArtist('a');
    void client.searchArtist('b');
    void client.searchArtist('c');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('MusicBrainz client fallback address', () => {
  const HOME = 'http://192.168.1.43:5001';
  const AWAY = 'http://100.64.0.1:5001';
  const client = () => createMusicbrainzClient({ serverUrl: HOME, fallbackUrls: [AWAY] });
  const unreachable = () => new TypeError('Network request failed');

  beforeEach(() => _resetCache());

  it('asks the first address first', async () => {
    await client().searchArtist('Muse');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOfCall(0).startsWith(`${HOME}/ws/2/artist?query=`)).toBe(true);
  });

  it('moves on to the fallback when the first address does not answer', async () => {
    fetchMock.mockRejectedValueOnce(unreachable());
    await client().searchArtist('Muse');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOfCall(1).startsWith(`${AWAY}/ws/2/artist?query=`)).toBe(true);
  });

  it('counts an address that timed out as one that did not answer', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('Request timed out after 8000ms'), { name: 'RequestTimeoutError' }));
    await client().searchArtist('Muse');
    expect(urlOfCall(1).startsWith(`${AWAY}/ws/2/artist?query=`)).toBe(true);
  });

  it('goes straight to the address that answered last', async () => {
    fetchMock.mockRejectedValueOnce(unreachable());
    await client().searchArtist('Muse');
    await client().searchArtist('Muse');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlOfCall(2).startsWith(`${AWAY}/ws/2/artist?query=`)).toBe(true);
  });

  it('does not move on when the first address answered with an error status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);
    await expect(client().searchArtist('Muse')).rejects.toThrow('MusicBrainz 503');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives an address a shorter wait only while another is behind it', async () => {
    await client().searchArtist('Muse');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ timeoutMs: 8000 }));
    fetchMock.mockRejectedValueOnce(unreachable());
    _resetCache();
    await client().searchArtist('Muse');
    expect(fetchMock.mock.calls[2][1]).not.toHaveProperty('timeoutMs');
  });

  it('is unchanged when there is no fallback', async () => {
    await createMusicbrainzClient({ serverUrl: HOME }).searchArtist('Muse');
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('timeoutMs');
  });

  it('ignores a fallback when there is no address of your own', async () => {
    await createMusicbrainzClient({ fallbackUrls: [AWAY] }).searchArtist('Muse');
    expect(urlOfCall(0).startsWith('https://musicbrainz.org/ws/2/artist?query=')).toBe(true);
  });
});
