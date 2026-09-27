import {
  cancelDownload,
  downloadTrack,
  fetchQueue,
  resolve,
  testConnection,
} from './';
import { YtFallbackError } from './client';

const config = { serverUrl: 'http://192.168.1.43:5020', apiKey: 'test-key' };

const answer = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const job = {
  id: '63eb1dda-5845-4791-a0b1-deaf4d43666f',
  title: 'Radioactive',
  artist: 'Imagine Dragons',
  status: 'done',
  progress: 100,
  source: 'slskd',
  error: null,
  created_at: 1790482552.22,
};

describe('testConnection', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('reads the queue with the key, since /health alone would not prove the key is right', async () => {
    fetchMock.mockResolvedValue(answer([]));

    await expect(testConnection(config)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.43:5020/queue');
    expect(init.headers.Authorization).toBe('Bearer test-key');
  });

  it('throws with the status when the key is wrong', async () => {
    fetchMock.mockResolvedValue(answer('', false, 401));

    const error = await testConnection(config).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YtFallbackError);
    expect((error as YtFallbackError).status).toBe(401);
  });
});

describe('downloadTrack', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('posts the free-text request and reports the job id back', async () => {
    fetchMock.mockResolvedValue(answer({ accepted: true, id: job.id }));

    const result = await downloadTrack(config, { title: 'Radioactive', artist: 'Imagine Dragons' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.43:5020/request');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ title: 'Radioactive', artist: 'Imagine Dragons' });
    expect(result).toEqual({ id: job.id });
  });
});

describe('fetchQueue', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('normalises a bare array response', async () => {
    fetchMock.mockResolvedValue(answer([job]));

    await expect(fetchQueue(config)).resolves.toEqual([
      { id: job.id, status: 'done', title: 'Radioactive', artist: 'Imagine Dragons', progress: 100, error: null },
    ]);
  });

  it('accepts a single job object, the shape actually seen from a live call', async () => {
    fetchMock.mockResolvedValue(answer(job));

    await expect(fetchQueue(config)).resolves.toEqual([
      { id: job.id, status: 'done', title: 'Radioactive', artist: 'Imagine Dragons', progress: 100, error: null },
    ]);
  });

  it('unwraps a { queue: [...] } or { jobs: [...] } envelope', async () => {
    fetchMock.mockResolvedValueOnce(answer({ queue: [job] }));
    await expect(fetchQueue(config)).resolves.toHaveLength(1);

    fetchMock.mockResolvedValueOnce(answer({ jobs: [job] }));
    await expect(fetchQueue(config)).resolves.toHaveLength(1);
  });

  it('carries the error message through rather than dropping it', async () => {
    fetchMock.mockResolvedValue(answer({ ...job, status: 'error', error: 'no match found' }));

    const [record] = await fetchQueue(config);
    expect(record.error).toBe('no match found');
  });

  it('drops a job it could not address, rather than showing an uncancellable row', async () => {
    fetchMock.mockResolvedValue(answer([{ title: 'No id here' }]));

    await expect(fetchQueue(config)).resolves.toEqual([]);
  });

  it('fails soft to an empty queue on a shape it does not recognise', async () => {
    fetchMock.mockResolvedValue(answer({ unexpected: true }));

    await expect(fetchQueue(config)).resolves.toEqual([]);
  });
});

describe('cancelDownload', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('deletes the queue item by id', async () => {
    fetchMock.mockResolvedValue(answer({}, true, 204));

    await cancelDownload(config, { id: job.id });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://192.168.1.43:5020/queue/${job.id}`);
    expect(init.method).toBe('DELETE');
  });
});

describe('resolve', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('posts the request and reports a ready song id back', async () => {
    fetchMock.mockResolvedValue(answer({ status: 'ready', songId: 'nd-123' }));

    const result = await resolve(config, { title: 'Rumour Has It', artist: 'Adele' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.43:5020/resolve');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ title: 'Rumour Has It', artist: 'Adele' });
    expect(result).toEqual({ status: 'ready', songId: 'nd-123' });
  });

  it('includes mbid/isrc when given, and omits them when not', async () => {
    fetchMock.mockResolvedValue(answer({ status: 'pending', jobId: 'job-1', progress: 0 }));

    await resolve(config, { title: 'Rumour Has It', artist: 'Adele', mbid: 'mb-1', isrc: 'isrc-1' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      title: 'Rumour Has It', artist: 'Adele', mbid: 'mb-1', isrc: 'isrc-1',
    });
  });

  it('reports a pending job with its progress', async () => {
    fetchMock.mockResolvedValue(answer({ status: 'pending', jobId: 'job-1', progress: 42 }));

    await expect(resolve(config, { title: 'x', artist: 'y' }))
      .resolves.toEqual({ status: 'pending', jobId: 'job-1', progress: 42 });
  });

  it('tolerates snake_case field names', async () => {
    fetchMock.mockResolvedValue(answer({ status: 'pending', job_id: 'job-1', progress: 10 }));

    await expect(resolve(config, { title: 'x', artist: 'y' }))
      .resolves.toEqual({ status: 'pending', jobId: 'job-1', progress: 10 });
  });

  it('carries a failure reason through', async () => {
    fetchMock.mockResolvedValue(answer({ status: 'failed', reason: 'no match found' }));

    await expect(resolve(config, { title: 'x', artist: 'y' }))
      .resolves.toEqual({ status: 'failed', reason: 'no match found' });
  });

  it('fails soft to a failed status on a shape it does not recognise', async () => {
    fetchMock.mockResolvedValue(answer({ unexpected: true }));

    await expect(resolve(config, { title: 'x', artist: 'y' }))
      .resolves.toEqual({ status: 'failed', reason: 'unknown' });
  });
});

describe('the client', () => {
  it('refuses to be built without an address or key', async () => {
    await expect(testConnection({ serverUrl: '', apiKey: 'k' })).rejects.toThrow(/not configured/i);
    await expect(testConnection({ serverUrl: 'http://x', apiKey: '' })).rejects.toThrow(/not configured/i);
  });
});
