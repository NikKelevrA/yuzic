import {
  matchesAlbum,
  finishedSince,
  type AlbumIdentity,
  type DownloaderQueueItem,
} from './queueItem';

const album: AlbumIdentity = { title: 'In Rainbows', artist: 'Radiohead' };

/** A transfer whose title came off a remote folder — the Soulseek case. */
const loose = (title: string, artistName = ''): DownloaderQueueItem => ({
  id: 'q1',
  percentComplete: 50,
  title,
  artistName,
  active: true,
  identity: 'loose',
  transferIds: ['t1'],
});

/** A transfer for an album the downloader actually resolved — the Lidarr case. */
const exact = (title: string, artistName: string): DownloaderQueueItem => ({
  id: 'q1',
  percentComplete: 50,
  title,
  artistName,
  active: true,
  identity: 'exact',
  transferIds: ['t1'],
});

describe('a loosely identified transfer', () => {
  it('matches an exact title', () => {
    expect(matchesAlbum(loose('In Rainbows'), album)).toBe(true);
  });

  it('matches a title carrying extra release tags', () => {
    // Soulseek folder names are messy; this looseness is the point.
    expect(matchesAlbum(loose('In Rainbows (2007) [FLAC]'), album)).toBe(true);
  });

  it('matches when the queue title is the shorter of the two', () => {
    expect(matchesAlbum(loose('Rainbows'), album)).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(matchesAlbum(loose('  IN RAINBOWS  '), album)).toBe(true);
  });

  it('does not match an unrelated release', () => {
    expect(matchesAlbum(loose('OK Computer'), album)).toBe(false);
  });

  describe('short titles', () => {
    it('does not let a two-letter folder match everything containing it', () => {
      // The bug this guards: a queue entry from a folder called "EP" matched
      // Sleep, Deep and Repeat alike, badging unrelated albums as downloading.
      expect(matchesAlbum(loose('EP'), { title: 'Sleep', artist: 'A' })).toBe(false);
      expect(matchesAlbum(loose('EP'), { title: 'Repeat', artist: 'A' })).toBe(false);
    });

    it('still matches a genuinely short album title exactly', () => {
      // Short titles are real, so they are compared exactly rather than dropped.
      expect(matchesAlbum(loose('X'), { title: 'X', artist: 'A' })).toBe(true);
      expect(matchesAlbum(loose('1989'), { title: '1989', artist: 'A' })).toBe(true);
    });

    it('does not match a short title against a longer one', () => {
      expect(matchesAlbum(loose('X'), { title: 'X&Y', artist: 'A' })).toBe(false);
    });

    it('does not match an empty title', () => {
      expect(matchesAlbum(loose(''), album)).toBe(false);
      expect(matchesAlbum(loose('In Rainbows'), { title: '', artist: 'A' })).toBe(false);
    });
  });

  describe('artist', () => {
    it('requires the artist to agree when the path revealed one', () => {
      // Two artists' "Greatest Hits" are not the same download.
      expect(matchesAlbum(
        loose('Greatest Hits', 'Queen'),
        { title: 'Greatest Hits', artist: 'Radiohead' }
      )).toBe(false);
    });

    it('matches when the artist agrees', () => {
      expect(matchesAlbum(loose('In Rainbows', 'Radiohead'), album)).toBe(true);
    });

    it('falls back to the title alone when the path revealed no artist', () => {
      // Most Soulseek layouts do not name an artist; requiring one would badge
      // nothing at all.
      expect(matchesAlbum(loose('In Rainbows', ''), album)).toBe(true);
    });

    it('tolerates an artist folder carrying extra text', () => {
      expect(matchesAlbum(loose('In Rainbows', 'Radiohead (UK)'), album)).toBe(true);
    });
  });
});

describe('an exactly identified transfer', () => {
  it('matches the album it resolved', () => {
    expect(matchesAlbum(exact('In Rainbows', 'Radiohead'), album)).toBe(true);
  });

  it('refuses a near miss, because it knows what it queued', () => {
    // The looseness above exists for folder names. Applying it to a downloader
    // that resolved the album by id would badge the wrong one as downloading.
    expect(matchesAlbum(exact('In Rainbows (2007) [FLAC]', 'Radiohead'), album)).toBe(false);
    expect(matchesAlbum(exact('Rainbows', 'Radiohead'), album)).toBe(false);
  });

  it('requires the artist to agree', () => {
    expect(matchesAlbum(exact('In Rainbows', 'Queen'), album)).toBe(false);
  });

  it('still ignores case and surrounding whitespace', () => {
    expect(matchesAlbum(exact('  IN RAINBOWS ', 'radiohead'), album)).toBe(true);
  });
});

describe('finishedSince', () => {
  const withId = (id: string): DownloaderQueueItem => ({ ...loose(`title ${id}`), id });

  it('reports what left the queue', () => {
    // Disappearance is the completion signal: a downloader that finishes
    // writes into the library the way a manual copy would, and the media
    // server has no idea until it scans.
    const finished = finishedSince([withId('a'), withId('b')], [withId('b')]);

    expect(finished.map(item => item.id)).toEqual(['a']);
  });

  it('reports nothing when the queue is unchanged', () => {
    expect(finishedSince([withId('a')], [withId('a')])).toEqual([]);
  });

  it('reports nothing on the first read', () => {
    // Everything is new, and reading an empty baseline as "everything
    // finished" would kick a library scan on every launch.
    expect(finishedSince([], [withId('a'), withId('b')])).toEqual([]);
  });

  it('reports the whole queue emptying', () => {
    const finished = finishedSince([withId('a'), withId('b')], []);

    expect(finished.map(item => item.id)).toEqual(['a', 'b']);
  });
});
