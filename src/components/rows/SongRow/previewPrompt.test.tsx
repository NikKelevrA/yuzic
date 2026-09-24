import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import SongRow from './index';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';

jest.mock('@/features/library/useLocalFirst', () => ({
  useLocalFirst: () => ({
    index: {
      songs: { size: 0, find: () => null },
      albums: { size: 0, find: () => null },
      artists: { size: 0, find: () => null },
    },
    localSong: () => null,
    localAlbum: () => null,
    localArtist: () => null,
    preferLocalSong: (song: unknown) => song,
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666' } }),
}));
jest.mock('@/features/theme/useListDensity', () => ({
  useListDensity: () => ({ rowPadding: 8, trackRowPadding: 8 }),
}));
jest.mock('@/features/playback/PlayingContext', () => ({
  usePlayingActions: () => ({ playSongInCollection: jest.fn() }),
}));
jest.mock('@/features/entity-actions/SongActionSheetContext', () => ({
  useSongActionSheets: () => ({ openSongOptions: jest.fn() }),
}));
jest.mock('@/features/offline/DownloadContext', () => ({
  useDownloadState: () => ({ isTrackDownloaded: () => false }),
}));
// Previews are off: the row has nothing to play and must not ask.
jest.mock('@/features/settings/sources/useSourceUse', () => ({
  useSourceUse: () => false,
}));
jest.mock('@/components/options/SongOptions', () => 'SongOptions');
jest.mock('@/components/useSheetRef', () => ({
  useSheetRef: () => ({ current: null }),
}));
jest.mock('@/components/MediaListRow', () => {
  const { Text } = require('react-native');
  return function MockMediaListRow({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
    return (
      <Text onPress={disabled ? undefined : onPress} accessibilityState={{ disabled }}>
        {title}
      </Text>
    );
  };
});
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (v: unknown) => v,
  };
});

const provenance = integrationProvenance('deezer');
const outsideSong: Song = {
  localId: makeLocalId('song', provenance, 'dz-1'),
  nativeId: 'dz-1',
  provenance,
  externalIds: {},
  title: 'Blunts',
  artist: { localId: makeLocalId('artist', provenance, 'dz-ar'), nativeId: 'dz-ar', externalIds: {}, name: 'Artist', cover: { kind: 'none' } },
  album: { localId: makeLocalId('album', provenance, 'dz-al'), nativeId: 'dz-al', externalIds: {}, title: 'Album', cover: { kind: 'none' } },
  cover: { kind: 'none' },
  durationSeconds: 30,
  contentKind: 'song',
  genres: [],
};

describe('tapping an outside track with previews off', () => {
  it('does nothing and reads as disabled, rather than asking to turn previews on', async () => {
    const view = await render(<SongRow song={outsideSong} albumTitle="Album" albumArtist="Artist" />);

    const row = view.getByText('Blunts');
    expect(row.props.accessibilityState).toEqual({ disabled: true });

    // No onPress means nothing to play; tapping must not throw or prompt.
    expect(() => fireEvent.press(row)).not.toThrow();
  });

  it('still plays normally once the caller hands it a real clip to play', async () => {
    const play = jest.fn();
    const view = await render(
      <SongRow song={outsideSong} albumTitle="Album" albumArtist="Artist" previewUrl="https://clip" onPress={play} />,
    );

    const row = view.getByText('Blunts');
    expect(row.props.accessibilityState).toEqual({ disabled: false });

    fireEvent.press(row);

    expect(play).toHaveBeenCalledTimes(1);
  });
});
