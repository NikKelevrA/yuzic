import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { Song } from '@/domain/entities/Song';
import {
  needsSnapshot,
  resourceFromBookmarkSnapshot,
  toBookmarkSnapshot,
} from './bookmarkSnapshot';

const provenance = serverProvenance('srv-1');

const librarySong: Song = {
  localId: makeLocalId('song', provenance, 'track-1'),
  nativeId: 'track-1',
  provenance,
  externalIds: {},
  title: 'A Long Song',
  artist: { localId: makeLocalId('artist', provenance, 'artist-1'), nativeId: 'artist-1', externalIds: {}, name: 'An Artist', cover: { kind: 'none' } },
  album: { localId: makeLocalId('album', provenance, 'album-1'), nativeId: 'album-1', externalIds: {}, title: 'An Album', cover: { kind: 'none' } },
  cover: { kind: 'navidrome', coverArtId: 'art-1' },
  durationSeconds: 2400,
  contentKind: 'song',
  genres: [],
};

const podcastSong: Song = {
  ...librarySong,
  localId: makeLocalId('song', provenance, 'podcast:ep-9'),
  nativeId: 'podcast:ep-9',
  streamId: 'stream-77',
  title: 'Episode 9',
  artist: { ...librarySong.artist, name: 'A Show' },
  album: { ...librarySong.album, nativeId: 'channel-3' },
  contentKind: 'podcastEpisode',
};

describe('needsSnapshot', () => {
  it('does not snapshot a library track, which the library can still describe', () => {
    expect(needsSnapshot(librarySong)).toBe(false);
  });

  it('snapshots a podcast episode, which the library never holds', () => {
    expect(needsSnapshot(podcastSong)).toBe(true);
  });

  it('recognises a podcast by its id namespace even with the kind missing', () => {
    // A Song rebuilt from an older snapshot may arrive without contentKind.
    // The namespace is what actually decides whether the library join can
    // succeed, so it is what this asks.
    const { contentKind: _dropped, ...withoutKind } = podcastSong;
    expect(needsSnapshot(withoutKind as Song)).toBe(true);
  });
});

describe('toBookmarkSnapshot', () => {
  it('never carries the stream URL, which is signed with the user token', () => {
    // The slice is persisted, so a stored URL would put credentials on disk
    // and pin them to whatever they were when the bookmark was written.
    const snapshot = toBookmarkSnapshot(podcastSong);
    expect(JSON.stringify(snapshot)).not.toContain('SECRET');
    expect(JSON.stringify(snapshot)).not.toContain('stream.view');
    expect('streamUrl' in snapshot).toBe(false);
  });

  it('keeps the stream id, which is what rebuilds the URL later', () => {
    // Not the episode id: a podcast episode only gains a playable stream id
    // once the server has downloaded it, and they are different values.
    expect(toBookmarkSnapshot(podcastSong).streamId).toBe('stream-77');
  });

  it('keeps what a row needs to draw itself', () => {
    const snapshot = toBookmarkSnapshot(podcastSong);
    expect(snapshot.title).toBe('Episode 9');
    expect(snapshot.artist).toBe('A Show');
    expect(snapshot.cover).toEqual({ kind: 'navidrome', coverArtId: 'art-1' });
    expect(snapshot.duration).toBe('2400');
    expect(snapshot.channelId).toBe('channel-3');
  });
});

describe('resourceFromBookmarkSnapshot', () => {
  const episodeId = makeLocalId('song', provenance, 'podcast:ep-9');

  it('round-trips into something playable', () => {
    const snapshot = toBookmarkSnapshot(podcastSong);
    const rebuilt = resourceFromBookmarkSnapshot(episodeId, snapshot, 'https://fresh/url');

    expect(rebuilt?.song.localId).toBe(episodeId);
    expect(rebuilt?.song.title).toBe('Episode 9');
    expect(rebuilt?.streamUrl).toBe('https://fresh/url');
    expect(rebuilt?.song.contentKind).toBe('podcastEpisode');
  });

  it('recovers the origin from the bookmark key, weeks after it was written', () => {
    // The point of a readable identity: a snapshot carries no provenance of
    // its own, so the key has to give it back.
    const rebuilt = resourceFromBookmarkSnapshot(episodeId, { title: 'E', artist: 'S' }, 'u');

    expect(rebuilt?.song.provenance).toEqual({ origin: 'server', serverId: 'srv-1' });
    expect(rebuilt?.song.nativeId).toBe('podcast:ep-9');
  });

  it('refuses a key that does not identify a song', () => {
    expect(resourceFromBookmarkSnapshot(
      makeLocalId('album', provenance, 'al-1'),
      { title: 'E', artist: 'S' },
      'u',
    )).toBeNull();
  });

  it('falls back to a letter cover rather than rendering a hole', () => {
    const rebuilt = resourceFromBookmarkSnapshot(
      makeLocalId('song', provenance, 'podcast:ep-1'),
      { title: 'No Art', artist: 'A Show' },
      'https://fresh/url',
    );
    expect(rebuilt?.song.cover).toEqual({ kind: 'none' });
  });

  it('survives a snapshot written before duration was stored', () => {
    // Persisted state outlives the shape that wrote it; a missing duration
    // must not reach a progress bar as NaN.
    const rebuilt = resourceFromBookmarkSnapshot(
      makeLocalId('song', provenance, 'podcast:ep-2'),
      { title: 'Old', artist: 'A Show' },
      'https://fresh/url',
    );
    expect(rebuilt?.song.durationSeconds).toBe(0);
    expect(rebuilt?.song.durationSeconds).not.toBeNaN();
  });
});
