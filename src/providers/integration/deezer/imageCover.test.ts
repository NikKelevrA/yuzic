import { imageCover } from './imageCover';

const subject = { kind: 'artist' as const, name: 'Bibio' };

describe('Deezer image covers', () => {
  it('takes the first real picture, largest first', () => {
    expect(imageCover(['https://cdn/images/artist/abc/1000x1000.jpg', 'https://cdn/images/artist/abc/500x500.jpg'], subject))
      .toEqual({ kind: 'url', url: 'https://cdn/images/artist/abc/1000x1000.jpg' });
  });

  it("reads Deezer's empty-hash silhouette as no picture, and names who it is of", () => {
    expect(imageCover([
      'https://e-cdns-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg',
      'https://e-cdns-images.dzcdn.net/images/cover//500x500-000000-80-0-0.jpg',
      null,
    ], subject)).toEqual({ kind: 'none', subject });
  });
});
