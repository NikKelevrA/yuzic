import { ytfallbackDownloader } from './ytfallback';
import * as ytfallback from '@/providers/integration/ytfallback';

jest.mock('@/providers/integration/ytfallback');

const config = { serverUrl: 'http://192.168.1.43:5020', apiKey: 'key' };

describe('ytfallbackDownloader', () => {
  afterEach(() => jest.clearAllMocks());

  it('is track-only, like SoulSync before it', () => {
    expect(ytfallbackDownloader.downloadTrack).toBeDefined();
    expect(ytfallbackDownloader.downloadAlbum).toBeUndefined();
  });

  it('authenticates with an API key, the same tier as slskd and SoulSync', () => {
    expect(ytfallbackDownloader.auth).toEqual({ tier: 'apiKey', configKeys: ['serverUrl', 'apiKey'] });
  });

  it('reports success once the service accepts the request', async () => {
    (ytfallback.downloadTrack as jest.Mock).mockResolvedValue({ id: 'job-1' });

    await expect(
      ytfallbackDownloader.downloadTrack!(config, { title: 'Radioactive', artist: 'Imagine Dragons' })
    ).resolves.toEqual({ success: true });
  });

  it('reports failure with the underlying message rather than throwing', async () => {
    (ytfallback.downloadTrack as jest.Mock).mockRejectedValue(new Error('service unreachable'));

    await expect(
      ytfallbackDownloader.downloadTrack!(config, { title: 'X', artist: 'Y' })
    ).resolves.toEqual({ success: false, message: 'service unreachable' });
  });

  it('normalises a job into a queue item, surfacing the error as a warning', async () => {
    (ytfallback.fetchQueue as jest.Mock).mockResolvedValue([
      { id: 'job-1', status: 'error', title: 'X', artist: 'Y', progress: 0, error: 'no match found' },
    ]);

    const [item] = await ytfallbackDownloader.fetchQueue(config);
    expect(item).toMatchObject({
      id: 'job-1',
      percentComplete: 0,
      title: 'X',
      artistName: 'Y',
      active: false,
      identity: 'loose',
      warnings: ['no match found'],
    });
  });

  it('treats a done job as no longer active', async () => {
    (ytfallback.fetchQueue as jest.Mock).mockResolvedValue([
      { id: 'job-1', status: 'done', title: 'X', artist: 'Y', progress: 100, error: null },
    ]);

    const [item] = await ytfallbackDownloader.fetchQueue(config);
    expect(item.active).toBe(false);
    expect(item.warnings).toBeUndefined();
  });

  it('maps testConnection (boolean) to Health', async () => {
    (ytfallback.testConnection as jest.Mock).mockResolvedValue(true);
    await expect(ytfallbackDownloader.testConnection(config)).resolves.toEqual({ ok: true });
  });

  it('forwards cancel by id', async () => {
    await ytfallbackDownloader.cancelQueueItem!(config, {
      id: 'job-1',
      percentComplete: 0,
      title: 'X',
      artistName: 'Y',
      active: true,
      identity: 'loose',
      transferIds: ['job-1'],
    });

    expect(ytfallback.cancelDownload).toHaveBeenCalledWith(config, { id: 'job-1' });
  });
});
