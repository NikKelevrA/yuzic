/* eslint-disable import/first -- Jest mocks must be registered before these imports. */
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { getAudioMetadata } from '@missingcore/audio-metadata';
import { mmkv } from '@/state/mmkvStorage';
import { importLocalFiles, readLocalLibrary, setLocalStarred } from './store';

describe('local-library import', () => {
  beforeEach(() => {
    mmkv.clearAll();
    jest.clearAllMocks();
    (getAudioMetadata as jest.Mock).mockResolvedValue({
      metadata: { name: 'Track', artist: 'Artist', album: 'Album', track: 2, year: 2024 },
    });
  });

  it('copies supported files into private storage and indexes tag data', async () => {
    const result = await importLocalFiles([
      { uri: 'file:///cache/Track.flac', name: 'Track.flac' },
      { uri: 'file:///cache/notes.txt', name: 'notes.txt' },
    ]);

    expect(result).toEqual({ imported: 1, unsupported: 1, failed: 0 });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({
      from: 'file:///cache/Track.flac',
      to: expect.stringMatching(/^file:\/\/\/documents\/local-library\/local-[\w-]+\.flac$/),
    }));
    expect(getAudioMetadata).toHaveBeenCalledWith(expect.stringContaining('/local-library/local-'), expect.any(Array));

    const [track] = readLocalLibrary().tracks;
    expect(track).toEqual(expect.objectContaining({
      title: 'Track', artist: 'Artist', albumTitle: 'Album', trackNumber: 2,
      // The copied file's path, recorded once. It used to be duplicated across
      // `streamUrl`, `filePath` and `localPath`; the origin the track came from
      // is now stated by its provenance rather than a `sourceServerType` field.
      streamId: expect.stringContaining('/local-library/'),
      localPath: expect.stringContaining('/local-library/'),
    }));
  });

  it('retains valid imports and cleans up only malformed files in a mixed batch', async () => {
    (getAudioMetadata as jest.Mock)
      .mockResolvedValueOnce({ metadata: { name: 'Good', artist: 'Artist', album: 'Album' } })
      .mockRejectedValueOnce(new Error('Malformed audio'));

    const result = await importLocalFiles([
      { uri: 'file:///cache/Good.mp3', name: 'Good.mp3' },
      { uri: 'file:///cache/Broken.mp3', name: 'Broken.mp3' },
    ]);

    expect(result).toEqual({ imported: 1, unsupported: 0, failed: 1 });
    expect(readLocalLibrary().tracks).toHaveLength(1);
    expect(readLocalLibrary().tracks[0].title).toBe('Good');
    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('.mp3'),
      { idempotent: true },
    );
  });

  describe('importing the same file again', () => {
    it('adds a second copy rather than recognising the first', async () => {
      // Pinning current behaviour, not endorsing it. `importLocalFiles` mints a
      // fresh id per asset and never looks at what is already indexed, so a
      // listener who picks the same track twice gets two library entries and
      // two copies on disk.
      //
      // Whether that is right is a product question — the same song can
      // legitimately be imported twice from different masterings, and the
      // picker's URIs are temporary, so there is no cheap identity to dedupe
      // on. What is not acceptable is for it to be undefined, which it was:
      // nothing said what happens, so nothing would notice it changing.
      await importLocalFiles([{ uri: 'file:///cache/Track.flac', name: 'Track.flac' }]);
      await importLocalFiles([{ uri: 'file:///cache/Track.flac', name: 'Track.flac' }]);

      const { tracks } = readLocalLibrary();
      expect(tracks).toHaveLength(2);
      expect(tracks[0].id).not.toBe(tracks[1].id);
      expect(tracks[0].localPath).not.toBe(tracks[1].localPath);
    });

    it('keeps every import addressable on its own', async () => {
      // Two entries for one song is tolerable; two entries sharing one file is
      // not — deleting either would break the other, and the id is what a
      // deletion addresses.
      await importLocalFiles([
        { uri: 'file:///cache/A.flac', name: 'A.flac' },
        { uri: 'file:///cache/A.flac', name: 'A.flac' },
      ]);

      const { tracks } = readLocalLibrary();
      const paths = new Set(tracks.map(track => track.localPath));
      expect(paths.size).toBe(tracks.length);
    });
  });

  it('persists local favourites with the index', async () => {
    await importLocalFiles([{ uri: 'file:///cache/Track.mp3', name: 'Track.mp3' }]);
    const [track] = readLocalLibrary().tracks;
    setLocalStarred(track.id, true);
    expect(readLocalLibrary().starredIds).toEqual([track.id]);
  });
});
