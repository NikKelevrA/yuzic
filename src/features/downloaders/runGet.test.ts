import { runGet } from './runGet';
import { __resetToasts, getToasts } from '@/components/toast/notify';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && Object.keys(opts).length ? `${key}:${JSON.stringify(opts)}` : key;

const album = {
  localId: 'local:album:1',
  nativeId: 'n1',
  title: 'Power, Corruption & Lies',
  artist: { name: 'New Order' },
} as never;

beforeEach(() => { __resetToasts(); });

const downloaderWith = (def: Record<string, unknown>) =>
  ({ def: { id: 'slskd', label: 'slskd', albumAddedKey: 'added', ...def }, config: {} }) as never;

describe('runGet', () => {
  it('reports through one toast from start to finish, never a stack of three', async () => {
    const downloadAlbum = jest.fn().mockResolvedValue({ success: true });

    await runGet({
      downloader: downloaderWith({ downloadAlbum }),
      album,
      loadTracks: jest.fn(),
      t,
    });

    const toasts = getToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ variant: 'success', message: 'added' });
  });

  it('counts the songs while a track-only downloader works through an album', async () => {
    const seen: string[] = [];
    const downloadTrack = jest.fn().mockImplementation(async () => {
      seen.push(getToasts()[0].message);
      return { success: true };
    });

    await runGet({
      downloader: downloaderWith({ downloadTrack, downloadAlbum: undefined }),
      album,
      loadTracks: async () => [
        { title: 'Age of Consent', artist: 'New Order' },
        { title: 'The Village', artist: 'New Order' },
      ],
      t,
    });

    // The first request goes out under the opening message; by the second, the
    // toast has been rewritten with the count. This is the whole point of the
    // change — before it, the only report was a spinner nobody could dismiss.
    expect(seen[0]).toContain('externalAlbum.download.sending');
    expect(seen[1]).toContain('externalAlbum.download.progress');
    expect(getToasts()).toHaveLength(1);
  });

  it('answers false and says why when the downloader refuses', async () => {
    const downloadAlbum = jest.fn().mockResolvedValue({ success: false, code: 'nope' });

    const started = await runGet({
      downloader: downloaderWith({ downloadAlbum }),
      album,
      loadTracks: jest.fn(),
      t,
    });

    expect(started).toBe(false);
    expect(getToasts()[0]).toMatchObject({ variant: 'error' });
  });

  it('answers false when the downloader throws, rather than leaving a pinned spinner', async () => {
    const downloadAlbum = jest.fn().mockRejectedValue(new Error('socket closed'));

    const started = await runGet({
      downloader: downloaderWith({ downloadAlbum }),
      album,
      loadTracks: jest.fn(),
      t,
    });

    expect(started).toBe(false);
    const toasts = getToasts();
    expect(toasts).toHaveLength(1);
    // `loading` pins until dismissed, so a throw that left it in place would
    // hang a spinner on the screen for the rest of the session.
    expect(toasts[0].variant).toBe('error');
  });
});
