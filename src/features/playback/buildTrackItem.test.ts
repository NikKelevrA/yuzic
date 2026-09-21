import type { Song } from '@/domain/entities/Song';
import type { PlayableResource } from '@/features/playback/playableResource';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { buildTrackItem } from './buildTrackItem';

// `buildCover` reads the active server out of the Redux store to sign cover
// URLs, so importing it for real drags the whole store graph into a unit test
// about field mapping. Mocked because it is a store boundary, not because it
// is inconvenient — what it returns is covered by its own tests, and every
// fixture here has `cover: { kind: 'none' }`, for which the real function also
// answers null.
jest.mock('@/providers/registry/covers', () => ({
  buildCover: () => null,
}));

const provenance = serverProvenance('srv-1');

const song: Song = {
  localId: makeLocalId('song', provenance, 'song-1'),
  nativeId: 'song-1',
  provenance,
  externalIds: {},
  title: 'Song',
  artist: {
    localId: makeLocalId('artist', provenance, 'artist-1'),
    nativeId: 'artist-1',
    externalIds: {},
    name: 'Artist',
    cover: { kind: 'none' },
  },
  album: {
    localId: makeLocalId('album', provenance, 'album-1'),
    nativeId: 'album-1',
    externalIds: {},
    title: 'Album',
    cover: { kind: 'none' },
  },
  cover: { kind: 'none' },
  durationSeconds: 120,
  contentKind: 'song',
  genres: [],
};

/** A song plus the URL to play it from — what the player is actually handed. */
const baseSong: PlayableResource = { song, streamUrl: 'https://example.com/song.mp3' };

describe('buildTrackItem', () => {
  it('keys the item by the song localId, not nativeId', () => {
    // `resourceFromPlayerItem` parses provenance back out of this id, so it
    // has to be the branded localId the player is handed rather than the
    // origin's own — two servers can easily both call something `song-1`.
    expect(buildTrackItem(baseSong).mediaId).toBe(makeLocalId('song', provenance, 'song-1'));
  });

  it('carries display fields from the nested song', () => {
    const item = buildTrackItem(baseSong);
    expect(item.title).toBe('Song');
    expect(item.artist).toBe('Artist');
    expect(item.albumTitle).toBe('Album');
    expect(item.duration).toBe(120);
  });

  it('keeps remote URLs as strings', () => {
    expect(buildTrackItem(baseSong).url).toBe('https://example.com/song.mp3');
  });

  it('passes local file URLs as uri objects for native playback', () => {
    expect(buildTrackItem({
      ...baseSong,
      streamUrl: 'file:///documents/downloads/audio/song-1.mp3',
    }).url).toEqual({ uri: 'file:///documents/downloads/audio/song-1.mp3' });
  });

  it('normalizes absolute local paths before passing them to native playback', () => {
    expect(buildTrackItem({
      ...baseSong,
      streamUrl: '/documents/downloads/audio/song-1.mp3',
    }).url).toEqual({ uri: 'file:///documents/downloads/audio/song-1.mp3' });
  });

  it('omits headers and artworkHeaders when none are supplied', () => {
    const item = buildTrackItem(baseSong);
    expect(item).not.toHaveProperty('headers');
    expect(item).not.toHaveProperty('artworkHeaders');
  });

  it('omits headers and artworkHeaders when the extra carries none', () => {
    const item = buildTrackItem(baseSong, {});
    expect(item).not.toHaveProperty('headers');
    expect(item).not.toHaveProperty('artworkHeaders');
  });

  it('carries audio and artwork headers through when supplied', () => {
    const item = buildTrackItem(baseSong, {
      headers: { Authorization: 'Basic abc' },
      artworkHeaders: { Authorization: 'Basic abc' },
    });
    expect(item.headers).toEqual({ Authorization: 'Basic abc' });
    expect(item.artworkHeaders).toEqual({ Authorization: 'Basic abc' });
  });

  it('carries one header field independently of the other', () => {
    const item = buildTrackItem(baseSong, { headers: { Authorization: 'Basic abc' } });
    expect(item.headers).toEqual({ Authorization: 'Basic abc' });
    expect(item).not.toHaveProperty('artworkHeaders');
  });
});
