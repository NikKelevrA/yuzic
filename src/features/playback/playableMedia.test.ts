import type { MediaItem } from '@/features/player/mediaItem';
import { getMediaItemId, getMediaItemUrl } from './playableMedia';


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
