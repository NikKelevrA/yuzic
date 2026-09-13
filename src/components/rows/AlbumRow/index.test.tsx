import React from 'react';
import { render } from '@testing-library/react-native';

import AlbumRow, { isExternalAlbum } from './index';
import type { Album } from '@/domain/entities/Album';
import { useExternalAlbumStatus } from '@/features/downloaders/useExternalAlbumStatus';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666' } }),
}));

jest.mock('@/hooks/useRadius', () => ({
  useRadius: () => ({ thumb: 8, pill: 999, pillFor: (n: number) => n / 2 }),
}));

jest.mock('@/utils/useSheetRef', () => ({
  useSheetRef: () => ({ current: null }),
}));

jest.mock('@/components/options/AlbumOptions', () => 'AlbumOptions');
jest.mock('@/components/MediaListRow', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: RNText, View: RNView } = require('react-native');
  function MockMediaListRow({ title, subtitleTrailing, trailing }: any) {
    return (
      <RNView>
        <RNText>{title}</RNText>
        {subtitleTrailing}
        {trailing}
      </RNView>
    );
  }
  return MockMediaListRow;
});

jest.mock('@/features/downloaders/useExternalAlbumStatus', () => ({
  useExternalAlbumStatus: jest.fn(),
}));

// AlbumRow pulls in IconActionButton -> SpinningLoaderCircle, which uses
// react-native-reanimated; the module's own jest mock is ESM and isn't
// covered by the project's transformIgnorePatterns, so a minimal inline
// stub is used instead of `react-native-reanimated/mock`.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    Easing: { linear: (v: unknown) => v },
    cancelAnimation: () => {},
  };
});

const mockedUseExternalAlbumStatus = useExternalAlbumStatus as jest.Mock;

const libraryAlbum: Album = {
  localId: 'local:album:srv:server1:a1' as Album['localId'],
  nativeId: 'a1',
  provenance: { origin: 'server', serverId: 'server1' },
  externalIds: {},
  libraryState: 'in-library',
  title: 'Local Album',
  cover: { kind: 'none' },
  artist: {
    localId: 'local:artist:srv:server1:ar1' as Album['artist']['localId'],
    nativeId: 'ar1',
    name: 'Some Artist',
    cover: { kind: 'none' },
    externalIds: {},
  },
  year: 2020,
  releaseType: 'album',
  genres: [],
  songIds: [],
};

const externalAlbum: Album = {
  localId: 'local:album:ext:deezer:ext1' as Album['localId'],
  nativeId: 'ext1',
  provenance: { origin: 'integration', providerId: 'deezer' },
  externalIds: {},
  libraryState: 'external',
  title: 'External Album',
  cover: { kind: 'none' },
  artist: {
    localId: 'local:artist:ext:deezer:extArtist1' as Album['artist']['localId'],
    nativeId: 'extArtist1',
    name: 'External Artist',
    cover: { kind: 'none' },
    externalIds: {},
  },
  releaseType: 'album',
  genres: [],
  songIds: [],
};

describe('AlbumRow', () => {
  beforeEach(() => {
    mockedUseExternalAlbumStatus.mockReset().mockReturnValue({ kind: 'none' });
  });

  it('detects external-origin albums via provenance', () => {
    expect(isExternalAlbum(libraryAlbum)).toBe(false);
    expect(isExternalAlbum(externalAlbum)).toBe(true);
  });

  it('renders no status badge for a plain library album', async () => {
    const view = await render(<AlbumRow album={libraryAlbum} />);
    expect(view.queryByText(/%/)).toBeNull();
    // The library branch never calls into the download-queue hook with a
    // real album — it is invoked with null, matching today's disabled/no-op
    // behavior for library rows.
    expect(mockedUseExternalAlbumStatus).toHaveBeenCalledWith(null);
  });

  it('renders the in_library badge for an external album already in the library', async () => {
    mockedUseExternalAlbumStatus.mockReturnValue({ kind: 'in_library' });
    const view = await render(<AlbumRow album={externalAlbum} />);
    expect(mockedUseExternalAlbumStatus).toHaveBeenCalledWith(externalAlbum);
    expect(view.getByText('External Album')).toBeTruthy();
  });

  it('renders the downloading badge with progress for an in-flight download', async () => {
    mockedUseExternalAlbumStatus.mockReturnValue({ kind: 'downloading', progress: 42, source: 'lidarr' });
    const view = await render(<AlbumRow album={externalAlbum} />);
    expect(view.getByText('42%')).toBeTruthy();
  });
});
