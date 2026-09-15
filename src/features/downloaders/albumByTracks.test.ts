import { downloadAlbumByTracks } from './albumByTracks';

const tracks = [
  { title: 'One', artist: 'Band' },
  { title: 'Two', artist: 'Band' },
  { title: 'Three', artist: 'Band' },
];

describe('downloadAlbumByTracks', () => {
  it('requests every track, in order, one at a time', async () => {
    const order: string[] = [];
    let inFlight = 0;
    const downloadTrack = jest.fn(async (_config: string, req: { title: string }) => {
      inFlight += 1;
      expect(inFlight).toBe(1);
      order.push(req.title);
      await Promise.resolve();
      inFlight -= 1;
      return { success: true as const };
    });

    await expect(downloadAlbumByTracks(downloadTrack, 'cfg', tracks)).resolves.toEqual({ success: true });
    expect(order).toEqual(['One', 'Two', 'Three']);
    expect(downloadTrack).toHaveBeenCalledWith('cfg', tracks[0]);
  });

  it('keeps going after a failure and says only part of the album failed', async () => {
    const downloadTrack = jest.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ success: true });

    const result = await downloadAlbumByTracks(downloadTrack, 'cfg', tracks);

    expect(downloadTrack).toHaveBeenCalledTimes(3);
    expect(result).toEqual(expect.objectContaining({ success: false, code: 'some_tracks_failed' }));
  });

  it("reports the downloader's own failure when every track fails", async () => {
    const downloadTrack = jest.fn().mockResolvedValue({ success: false, code: 'INVALID_KEY', message: 'bad key' });

    await expect(downloadAlbumByTracks(downloadTrack, 'cfg', tracks))
      .resolves.toEqual({ success: false, code: 'INVALID_KEY', message: 'bad key' });
  });

  it('has nothing to request for an album without tracks', async () => {
    const downloadTrack = jest.fn();

    await expect(downloadAlbumByTracks(downloadTrack, 'cfg', []))
      .resolves.toEqual(expect.objectContaining({ success: false, code: 'no_tracks' }));
    expect(downloadTrack).not.toHaveBeenCalled();
  });
});
