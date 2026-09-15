import { firstResolvableCover, hasCoverImage, type CoverSource } from './Cover';

const navidrome: CoverSource = { kind: 'navidrome', coverArtId: 'al-3' };
const url: CoverSource = { kind: 'url', url: 'https://example.com/a.jpg' };
const none: CoverSource = { kind: 'none' };

describe('hasCoverImage', () => {
  it('treats a none cover as no image, which is the trap `??` falls into', () => {
    expect(hasCoverImage(none)).toBe(false);
    expect(hasCoverImage(navidrome)).toBe(true);
  });

  it('treats null and undefined as no image', () => {
    expect(hasCoverImage(null)).toBe(false);
    expect(hasCoverImage(undefined)).toBe(false);
  });
});

describe('firstResolvableCover', () => {
  it('skips a none cover to reach a real one, unlike ??', () => {
    expect(none ?? url).toEqual(none); // the bug this exists to prevent
    expect(firstResolvableCover(none, url)).toEqual(url);
  });

  it('returns the first cover that will resolve, in preference order', () => {
    expect(firstResolvableCover(navidrome, url)).toEqual(navidrome);
  });

  it('skips absent entries as well as none ones', () => {
    expect(firstResolvableCover(undefined, null, none, url)).toEqual(url);
  });

  it('returns null when nothing will resolve', () => {
    expect(firstResolvableCover(undefined, none, null)).toBeNull();
  });
});
