/**
 * The index is built once for the whole screen, not once per component.
 *
 * `SongRow` calls `useLocalFirst`, so this is the difference between one
 * index build and one per visible row. It regressed silently once because
 * `useMemo` reads as shared and is per component instance: fifteen rows meant
 * fifteen scans of the whole library, which at 90,000 tracks is seconds.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

let mockSongs: unknown[] = Array.from({ length: 2000 }, (_, i) => ({
  localId: `s${i}`, nativeId: `${i}`, externalIds: {}, title: `T${i}`,
  artist: { localId: `a${i % 50}`, nativeId: `${i % 50}`, externalIds: {}, name: `A${i % 50}`, cover: { kind: 'none' } },
  album: { localId: `al${i % 100}`, nativeId: `${i % 100}`, externalIds: {}, title: `Al${i % 100}`, cover: { kind: 'none' } },
}));

// Stable identities, as the real hooks give: `useOfflineFirstQuery` holds an
// `emptyRef` for exactly this reason. A fresh `[]` per call would miss the
// cache every time and the test would be measuring its own mock.
const mockEmptyAlbums: unknown[] = [];
const mockEmptyArtists: unknown[] = [];
jest.mock('@/features/album/useAlbums', () => ({ useAlbums: () => ({ albums: mockEmptyAlbums }) }));
jest.mock('@/features/artist/useArtists', () => ({ useArtists: () => ({ artists: mockEmptyArtists }) }));
jest.mock('@/features/song/useTracks', () => ({ useTracks: () => ({ tracks: mockSongs }) }));

const mockBuildSpy = jest.fn();
jest.mock('./localFirst', () => {
  const actual = jest.requireActual('./localFirst');
  return {
    ...actual,
    buildLibraryIndex: (...args: unknown[]) => {
      mockBuildSpy();
      return (actual.buildLibraryIndex as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import { useLocalFirst, _resetLibraryIndex } from './useLocalFirst';

function Row() {
  useLocalFirst();
  return <Text>row</Text>;
}

beforeEach(() => {
  _resetLibraryIndex();
  mockBuildSpy.mockClear();
});

describe('useLocalFirst', () => {
  it('builds the index once for a screen full of rows, not once per row', async () => {
    await render(<>{Array.from({ length: 15 }, (_, i) => <Row key={i} />)}</>);

    expect(mockBuildSpy).toHaveBeenCalledTimes(1);
  });

  it('builds again when the catalog itself changes', async () => {
    await render(<Row />);
    expect(mockBuildSpy).toHaveBeenCalledTimes(1);

    // A sync replaces the array, and the array identity is the cache key.
    mockSongs = mockSongs.slice(0, 500);
    await render(<Row />);

    expect(mockBuildSpy).toHaveBeenCalledTimes(2);
  });

  it('does not rebuild for a second screen reading the same catalog', async () => {
    await render(<Row />);
    await render(<Row />);
    await render(<Row />);

    expect(mockBuildSpy).toHaveBeenCalledTimes(1);
  });
});
