import type { MediaItem } from '../features/player/mediaItem';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { Song } from '@/domain/entities/Song';
import type { PlayableResource } from '@/features/playback/playableResource';
import {
  buildMediaItem,
  getMediaItemId,
  getMediaItemUrl,
} from './playableMedia';

const provenance = serverProvenance('srv-1');

function song(nativeId: string, overrides: Partial<Song> = {}): Song {
  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: `Track ${nativeId}`,
    artist: {
      localId: makeLocalId('artist', provenance, 'a1'),
      nativeId: 'a1',
      externalIds: {},
      name: 'Radiohead',
      cover: { kind: 'none' },
    },
    album: {
      localId: makeLocalId('album', provenance, 'al1'),
      nativeId: 'al1',
      externalIds: {},
      title: 'OK Computer',
      cover: { kind: 'none' },
    },
    cover: { kind: 'none' },
    durationSeconds: 238,
    contentKind: 'song',
    genres: [],
    ...overrides,
  };
}

function resource(nativeId: string, overrides: Partial<PlayableResource> = {}): PlayableResource {
  return {
    song: song(nativeId),
    streamUrl: `https://server.test/stream/${nativeId}`,
    ...overrides,
  };
}

describe('media item conversion', () => {
  it('prefers the media id over the url for identity', () => {
    expect(getMediaItemId({ mediaId: 'track-1', url: 'https://a.test/x' } as MediaItem))
      .toBe('track-1');
  });

  it('falls back to a string url when there is no media id', () => {
    expect(getMediaItemId({ url: 'https://a.test/x' } as MediaItem)).toBe('https://a.test/x');
  });

  it('reads a url given as a uri source', () => {
    expect(getMediaItemUrl({ url: { uri: 'https://a.test/x' } } as unknown as MediaItem))
      .toBe('https://a.test/x');
  });

  it('reads a plain string url', () => {
    expect(getMediaItemUrl({ url: 'https://a.test/x' } as MediaItem)).toBe('https://a.test/x');
  });

  it('yields an empty url for an unusable source', () => {
    expect(getMediaItemUrl({} as MediaItem)).toBe('');
    expect(getMediaItemUrl({ url: { uri: 42 } } as unknown as MediaItem)).toBe('');
  });
});

describe('buildMediaItem', () => {
  it('keys the item by the song localId, not nativeId', () => {
    // resourceFromPlayerItem parses provenance back out of this id, so it has
    // to be the branded localId the player is handed, not the origin's own id.
    const item = buildMediaItem(resource('a'));
    expect(item.mediaId).toBe(makeLocalId('song', provenance, 'a'));
  });

  it('carries display fields from the nested song', () => {
    const item = buildMediaItem(resource('a'));
    expect(item.title).toBe('Track a');
    expect(item.artist).toBe('Radiohead');
    expect(item.albumTitle).toBe('OK Computer');
    expect(item.duration).toBe(238);
  });

  it('wraps a file path url in a uri source', () => {
    const item = buildMediaItem(resource('a', { streamUrl: '/var/mobile/a.mp3' }));
    expect(item.url).toEqual({ uri: 'file:///var/mobile/a.mp3' });
  });

  it('leaves a remote url as a plain string', () => {
    const item = buildMediaItem(resource('a', { streamUrl: 'https://server.test/a.mp3' }));
    expect(item.url).toBe('https://server.test/a.mp3');
  });

  it('attaches request headers only when given', () => {
    const withHeaders = buildMediaItem(resource('a'), { headers: { Authorization: 'Basic x' } });
    expect(withHeaders.headers).toEqual({ Authorization: 'Basic x' });

    const withoutHeaders = buildMediaItem(resource('a'));
    expect(withoutHeaders.headers).toBeUndefined();
  });
});
