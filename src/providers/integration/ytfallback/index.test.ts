import {
  cancelDownload,
  downloadTrack,
  fetchQueue,
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

describe('the client', () => {
  it('refuses to be built without an address or key', async () => {
    await expect(testConnection({ serverUrl: '', apiKey: 'k' })).rejects.toThrow(/not configured/i);
    await expect(testConnection({ serverUrl: 'http://x', apiKey: '' })).rejects.toThrow(/not configured/i);
  });
});
