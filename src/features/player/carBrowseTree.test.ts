import type { BrowseItem } from './browse';
import { buildCarBrowseTree, type CarCollection, type CarLibrary } from './carBrowseTree';

const labels = {
  recent: 'Recent',
  favorites: 'Favorites',
  playlists: 'Playlists',
  albums: 'Albums',
  downloads: 'Downloads',
  shuffle: 'Shuffle',
};

const streamed = (id: string): BrowseItem => ({ mediaId: id, title: id, url: `https://music.test/${id}` });
const downloaded = (id: string): BrowseItem => ({ mediaId: id, title: id, url: `file:///data/${id}.flac` });

const collection = (kind: 'album' | 'playlist', id: string, tracks: BrowseItem[]): CarCollection => ({
  kind, id, title: id, subtitle: 'Someone', artworkUrl: `https://music.test/cover/${id}`, tracks,
});

const library = (over: Partial<CarLibrary> = {}): CarLibrary => ({
  recent: [collection('album', 'r1', [streamed('a'), streamed('b')])],
  favorites: [streamed('f1'), streamed('f2')],
  playlists: [collection('playlist', 'p1', [streamed('c'), streamed('d')])],
  albums: [collection('album', 'a1', [streamed('e'), streamed('g')])],
  downloads: [downloaded('x'), downloaded('y')],
  ...over,
});

const ids = (items: { mediaId: string }[]) => items.map(item => item.mediaId);

describe('the car browse tree', () => {
  it('shows recent, favorites, playlists and albums, in that order, and no more than four', () => {
    // Both cars draw the top level as tabs and stop at four.
    const tree = buildCarBrowseTree(library(), labels, { offline: false });
    expect(ids(tree)).toEqual(['recent', 'favorites', 'playlists', 'albums']);
  });

  it('gives each tab its icon and draws covers as a grid and tracks as a list', () => {
    const tree = buildCarBrowseTree(library(), labels, { offline: false });
    expect(tree.map(tab => [tab.icon, tab.layout])).toEqual([
      ['recent', 'grid'], ['favorites', 'list'], ['playlists', 'grid'], ['albums', 'grid'],
    ]);
  });

  it('shows Downloads when there is room for it', () => {
    const tree = buildCarBrowseTree(library({ recent: [], playlists: [] }), labels, { offline: false });
    expect(ids(tree)).toEqual(['favorites', 'albums', 'downloads']);
  });

  it('leaves out empty tabs and folders with nothing to play', () => {
    const tree = buildCarBrowseTree(
      library({ favorites: [], albums: [collection('album', 'empty', []), collection('album', 'a1', [streamed('e')])] }),
      labels,
      { offline: false },
    );
    expect(ids(tree)).toEqual(['recent', 'playlists', 'albums', 'downloads']);
    expect(ids(tree.find(tab => tab.mediaId === 'albums')!.items)).toEqual(['album-a1']);
  });

  it('starts every folder with Shuffle, and only when there is something to shuffle', () => {
    const tree = buildCarBrowseTree(
      library({ albums: [collection('album', 'single', [streamed('only')])] }),
      labels,
      { offline: false },
    );
    const album = tree.find(tab => tab.mediaId === 'recent')!.items[0];
    expect(album.children?.[0]).toEqual({ mediaId: 'shuffle', title: 'Shuffle', action: 'shuffle' });
    expect(ids(album.children!)).toEqual(['shuffle', 'a', 'b']);

    const favorites = tree.find(tab => tab.mediaId === 'favorites')!;
    expect(ids(favorites.items)).toEqual(['shuffle', 'f1', 'f2']);

    const single = tree.find(tab => tab.mediaId === 'albums')!.items[0];
    expect(ids(single.children!)).toEqual(['only']);
  });

  it('carries a folder cover and its artist', () => {
    const album = buildCarBrowseTree(library(), labels, { offline: false })[0].items[0];
    expect(album).toMatchObject({
      mediaId: 'album-r1',
      title: 'r1',
      artist: 'Someone',
      artworkUrl: 'https://music.test/cover/r1',
    });
  });

  describe('offline', () => {
    it('puts Downloads first', () => {
      const tree = buildCarBrowseTree(library(), labels, { offline: true });
      expect(tree[0].mediaId).toBe('downloads');
    });

    it('keeps only what is on the device, so nothing offered fails when tapped', () => {
      const tree = buildCarBrowseTree(
        library({
          albums: [collection('album', 'mixed', [streamed('s'), downloaded('d1'), downloaded('d2')])],
          favorites: [streamed('f1'), downloaded('f2')],
        }),
        labels,
        { offline: true },
      );
      // Recent and Playlists held only streams, so they are gone.
      expect(ids(tree)).toEqual(['downloads', 'favorites', 'albums']);
      expect(ids(tree.find(tab => tab.mediaId === 'favorites')!.items)).toEqual(['f2']);
      expect(ids(tree.find(tab => tab.mediaId === 'albums')!.items[0].children!)).toEqual(['shuffle', 'd1', 'd2']);
    });
  });
});
