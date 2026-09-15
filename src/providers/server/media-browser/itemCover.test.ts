import { EMBY_BRAND, JELLYFIN_BRAND, itemCover } from './brand';

const subject = { kind: 'artist' as const, name: 'Bibio' };

describe('MediaBrowser item covers', () => {
  it('reads a payload whose image tags have no primary as no picture, on either brand', () => {
    expect(itemCover(JELLYFIN_BRAND, { Id: 'a1', ImageTags: {} }, subject)).toEqual({ kind: 'none', subject });
    expect(itemCover(EMBY_BRAND, { Id: 'a1', ImageTags: {} }, subject)).toEqual({ kind: 'none', subject });
  });

  it('keeps a Jellyfin id-built cover when the payload says nothing about image tags', () => {
    expect(itemCover(JELLYFIN_BRAND, { Id: 'a1' }, subject)).toEqual({ kind: 'jellyfin', itemId: 'a1' });
  });

  it('builds the cover when a primary image is reported', () => {
    expect(itemCover(JELLYFIN_BRAND, { Id: 'a1', ImageTags: { Primary: 't' } }, subject)).toEqual({ kind: 'jellyfin', itemId: 'a1' });
    expect(itemCover(EMBY_BRAND, { Id: 'a1', ImageTags: { Primary: 't' } }, subject)).toEqual({ kind: 'emby', itemId: 'a1', tag: 't' });
  });
});
