import React from 'react';
import { Alert } from 'react-native';
import { render } from '@testing-library/react-native';

import PlaylistOptions from './PlaylistOptions';
import type { Playlist } from '@/domain/entities/Playlist';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS-only test mock, no typed ESM export
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.title ? `${key}:${opts.title}` : key) }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', border: '#ccc' }, isDarkMode: false }),
}));

jest.mock('@/components/BottomSheetBackdrop', () => ({ renderBackdrop: () => null }));

jest.mock('@/components/toast', () => ({
  notify: Object.assign(jest.fn(), { info: jest.fn(), success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() }),
}));

jest.mock('@/utils/haptics', () => ({
  __esModule: true,
  default: { selection: jest.fn(), tap: jest.fn(), primary: jest.fn(), heavy: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn() },
  selection: jest.fn(),
}));

jest.mock('@/api', () => ({ useApi: () => ({ shares: undefined }) }));

jest.mock('@/contexts/PlayingContext', () => ({
  usePlayingActions: () => ({
    playSongInCollection: jest.fn(), addCollectionToQueue: jest.fn(), shuffleCollectionToQueue: jest.fn(), getQueue: () => [], playNext: jest.fn(),
  }),
}));

jest.mock('@/contexts/DownloadContext', () => ({
  useDownload: () => ({ downloadPlaylistById: jest.fn(), getCollectionDownloadState: () => ({ isDownloaded: false, isDownloading: false }) }),
}));

const mockDeleteMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockRenameMutateAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('@/hooks/playlists/useDeletePlaylist', () => ({ useDeletePlaylist: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }) }));
jest.mock('@/hooks/playlists/useRenamePlaylist', () => ({ useRenamePlaylist: () => ({ mutateAsync: mockRenameMutateAsync }) }));

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('./useLazyCollectionDetails', () => ({
  useLazyPlaylistDetail: () => ({ playlistWithSongs: null, songs: [], songsLoading: false }),
}));

jest.mock('@/components/SpinningLoaderCircle', () => 'SpinningLoaderCircle');

jest.mock('@/components/options/OptionSheetPrimitives', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: RNText, View: RNView } = require('react-native');
  return {
    OptionSheetHeader: ({ title, subtitle }: any) => (
      <RNView>
        <RNText>{title}</RNText>
        {subtitle !== undefined && <RNText>{subtitle}</RNText>}
      </RNView>
    ),
    OptionSheetRow: ({ label, onPress, disabled }: any) => <RNText onPress={disabled ? undefined : onPress}>{label}</RNText>,
    OptionSheetInfoRow: ({ label, value }: any) => <RNText>{label}: {value}</RNText>,
    OptionSheetSectionLabel: ({ label }: any) => <RNText>{label}</RNText>,
    OptionSheetDivider: () => <RNView />,
    optionSheetStyles: { sheetBackground: {}, sheetContent: {}, loading: {} },
    useOptionSheetBackground: () => ({}),
  };
});

const ownedPlaylist: Playlist = {
  localId: 'local:playlist:srv:server1:p1' as Playlist['localId'],
  nativeId: 'p1',
  provenance: { origin: 'server', serverId: 'server1' },
  externalIds: {},
  libraryState: 'in-library',
  title: 'My Mix',
  cover: { kind: 'none' },
  isOwned: true,
  songIds: [],
};

const favoritesPlaylist: Playlist = {
  ...ownedPlaylist,
  nativeId: 'favorites',
  title: 'Favorites',
};

describe('PlaylistOptions', () => {
  beforeEach(() => {
    mockDeleteMutateAsync.mockClear();
    mockRenameMutateAsync.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the base playback + rename/delete action set for an ordinary playlist', async () => {
    const view = await render(<PlaylistOptions ref={null as any} playlist={ownedPlaylist} />);
    expect(view.getByText('playlistOptions.actions.play')).toBeTruthy();
    expect(view.getByText('playlistOptions.actions.rename')).toBeTruthy();
    expect(view.getByText('playlistOptions.actions.delete')).toBeTruthy();
  });

  it('hides rename/delete for the Favorites playlist', async () => {
    const view = await render(<PlaylistOptions ref={null as any} playlist={favoritesPlaylist} />);
    expect(view.queryByText('playlistOptions.actions.rename')).toBeNull();
    expect(view.queryByText('playlistOptions.actions.delete')).toBeNull();
  });

  it('confirms before deleting (destructive action) instead of deleting on the first tap', async () => {
    const view = await render(<PlaylistOptions ref={null as any} playlist={ownedPlaylist} />);
    view.getByText('playlistOptions.actions.delete').props.onPress();

    // The delete mutation must not run until the confirm dialog's destructive
    // button is pressed.
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    const destructiveButton = buttons.find((b: any) => b.style === 'destructive');
    expect(destructiveButton).toBeTruthy();

    await destructiveButton.onPress();
    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('p1');
  });

  it('renders no options-sheet rows for null playlist while it loads', async () => {
    const view = await render(<PlaylistOptions ref={null as any} playlist={null} />);
    expect(view.queryByText('playlistOptions.actions.play')).toBeNull();
  });
});
