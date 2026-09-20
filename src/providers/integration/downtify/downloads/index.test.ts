import {
  buildQuery,
  cancelDownload,
  downloadTrack,
  fetchQueue,
  testConnection,
} from './';
import { DowntifyError } from '../client';

const config = { serverUrl: 'https://downtify.example/' };

const answer = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

/**
 * A search result exactly as Downtify 3.0.0 returns one, plus a field this
 * app has never heard of — the schema is not published, so a future version
 * adding one has to survive the round trip.
 */
const searchHit = {
  song_id: 'SM4tQcUt_mQ',
  name: 'Roygbiv',
  artists: ['Boards of Canada'],
  album_name: 'Music Has The Right To Children',
  cover_url: 'https://yt3.googleusercontent.com/example=w600-h600-l90-rj',
  duration: 150,
  url: 'https://music.youtube.com/watch?v=SM4tQcUt_mQ',
  explicit: false,
  year: '',
  release_date: '',
  source: 'youtube',
  spotify_url: 'https://open.spotify.com/search/Boards%20of%20Canada%20Roygbiv',
  some_field_downtify_added_later: 'keep me',
};

describe('buildQuery', () => {
  it('spells the query the way the search expects', () => {
    expect(buildQuery({ title: 'Roygbiv', artist: 'Boards of Canada' }))
      .toBe('Boards of Canada - Roygbiv');
  });

  it('falls back to the title alone when there is no artist', () => {
    expect(buildQuery({ title: 'Roygbiv', artist: '' })).toBe('Roygbiv');
  });
});

describe('testConnection', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('asks for the version, with no credential of any kind', async () => {
    // JSON on the wire: the body is `"3.0.0"`, quotes included.
    fetchMock.mockResolvedValue(answer('"3.0.0"'));

    await expect(testConnection(config)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    // The trailing slash on the configured address must not double up.
    expect(url).toBe('https://downtify.example/api/version');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('says no when something else answers at the address', async () => {
    // A reverse proxy or the wrong service replies with a page, not a version.
    fetchMock.mockResolvedValue(answer(''));

    await expect(testConnection(config)).resolves.toBe(false);
  });

  it('says no when the answer is JSON but not a version string', async () => {
    fetchMock.mockResolvedValue(answer({ some: 'object' }));

    await expect(testConnection(config)).resolves.toBe(false);
  });

  it('reports the status when the address refuses', async () => {
    fetchMock.mockResolvedValue(answer('nope', false, 502));

    await expect(testConnection(config)).rejects.toMatchObject({
      name: 'DowntifyError',
      status: 502,
    });
  });
});

describe('downloadTrack', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('searches, then queues the top result through the batch endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(answer([searchHit, { song_id: 'other', name: 'Other' }]))
      .mockResolvedValueOnce(answer({ job_ids: ['SM4tQcUt_mQ'], count: 1 }));

    const result = await downloadTrack(config, { title: 'Roygbiv', artist: 'Boards of Canada' });

    const [searchUrl] = fetchMock.mock.calls[0];
    expect(searchUrl).toBe('https://downtify.example/api/songs/search?query=Boards%20of%20Canada%20-%20Roygbiv');
    const [downloadUrl, init] = fetchMock.mock.calls[1];
    // Not `/api/download/url`: that one blocks until the file has landed.
    expect(downloadUrl).toBe('https://downtify.example/api/download/batch');
    expect(init.method).toBe('POST');
    // `job_ids` carries the song's own `song_id`.
    expect(result.jobIds).toEqual(['SM4tQcUt_mQ']);
  });

  it('hands the search result back untouched, unknown fields and all', async () => {
    // Downtify does not publish the full song schema and says its fields have
    // to survive the round trip, so rebuilding the object would silently drop
    // whatever we did not know to copy.
    fetchMock
      .mockResolvedValueOnce(answer([searchHit]))
      .mockResolvedValueOnce(answer({ job_ids: ['SM4tQcUt_mQ'] }));

    await downloadTrack(config, { title: 'Roygbiv', artist: 'Boards of Canada' });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({ songs: [searchHit] });
  });

  it('does not ask for an M3U, which would leave a playlist per track', async () => {
    fetchMock
      .mockResolvedValueOnce(answer([searchHit]))
      .mockResolvedValueOnce(answer({ job_ids: ['SM4tQcUt_mQ'] }));

    await downloadTrack(config, { title: 'Roygbiv', artist: 'Boards of Canada' });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.generate_m3u).toBeUndefined();
    expect(body.playlist_url).toBeUndefined();
  });

  it('says so when the search found nothing, rather than queueing nothing', async () => {
    fetchMock.mockResolvedValueOnce(answer([]));

    await expect(downloadTrack(config, { title: 'Nothing', artist: 'Nobody' }))
      .rejects.toThrow(/found nothing/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchQueue', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('normalises a job into a record', async () => {
    fetchMock.mockResolvedValue(answer([
      {
        song: searchHit,
        status: 'downloading',
        progress: 42,
        provider: 'youtube-music',
        message: 'fetching',
        filename: 'Boards of Canada - Roygbiv.mp3',
      },
    ]));

    await expect(fetchQueue(config)).resolves.toEqual([
      {
        id: 'SM4tQcUt_mQ',
        status: 'downloading',
        title: 'Roygbiv',
        artist: 'Boards of Canada',
        album: 'Music Has The Right To Children',
        progress: 42,
        provider: 'youtube-music',
        message: 'fetching',
      },
    ]);
  });

  it('joins a collaboration rather than showing only the first name', async () => {
    fetchMock.mockResolvedValue(answer([
      { song: { song_id: 's', name: 'T', artists: ['A', 'B'] }, status: 'queued', progress: 0 },
    ]));

    const [record] = await fetchQueue(config);
    expect(record.artist).toBe('A, B');
  });

  it('reports an empty provider while nothing has served it yet', async () => {
    // What a freshly queued job really looks like: no provider, no filename.
    fetchMock.mockResolvedValue(answer([
      { song: { song_id: 's', name: 'T', artists: ['A'] }, status: 'downloading', progress: 0, message: '', provider: '', filename: null },
    ]));

    const [record] = await fetchQueue(config);
    expect(record.provider).toBe('');
    expect(record.status).toBe('downloading');
  });

  it('drops a job it could not address, rather than showing an uncancellable row', async () => {
    fetchMock.mockResolvedValue(answer([
      { song: { name: 'T', artists: ['A'] }, status: 'queued', progress: 0 },
    ]));

    await expect(fetchQueue(config)).resolves.toEqual([]);
  });

  it('survives a body that is not a list', async () => {
    fetchMock.mockResolvedValue(answer({ unexpected: true }));

    await expect(fetchQueue(config)).resolves.toEqual([]);
  });
});

describe('cancelDownload', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('deletes the queue item by song id', async () => {
    fetchMock.mockResolvedValue(answer({ removed: true }));

    await cancelDownload(config, { id: 'song 1' });

    const [url, init] = fetchMock.mock.calls[0];
    // Answers `{"removed":true}` against a live server.
    expect(url).toBe('https://downtify.example/api/queue/item?song_id=song%201');
    expect(init.method).toBe('DELETE');
  });
});

describe('the client', () => {
  it('refuses to be built without an address', async () => {
    await expect(testConnection({ serverUrl: '  ' })).rejects.toThrow(/not configured/i);
  });

  it('carries the status on a refusal, so "not running" reads differently from "refused"', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(answer('', false, 404));

    const error = await testConnection(config).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DowntifyError);
    expect((error as DowntifyError).status).toBe(404);
  });
});
