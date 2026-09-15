import React from 'react';
import { render } from '@testing-library/react-native';

import ArtistOptions from './ArtistOptions';
import type { Artist } from '@/domain/entities/Artist';

jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', border: '#ccc' }, isDarkMode: false }),
}));

jest.mock('@/components/BottomSheetBackdrop', () => ({
  renderBackdrop: () => null,
}));

jest.mock('@/components/toast', () => ({
  notify: Object.assign(jest.fn(), { info: jest.fn(), success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() }),
}));

jest.mock('react-redux', () => ({
  useSelector: (selector: any) => selector({}),
}));

jest.mock('@/state/redux/selectors/statsSelectors', () => ({
  selectArtistPlayCount: () => () => 0,
}));

jest.mock('@/providers/registry/similarityService', () => ({
  useSimilarityService: () => ({ similarTrackIds: async () => [] }),
}));

const mockCanGeneratePlaylist = jest.fn(() => false);
const mockGenerateForArtist = jest.fn();
jest.mock('@/features/playlist/generateSimilarPlaylist', () => ({
  useCanGeneratePlaylist: () => mockCanGeneratePlaylist(),
  generateSimilarPlaylistForArtist: (...args: unknown[]) => mockGenerateForArtist(...args),
}));

jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => ({}),
}));

jest.mock('@/features/playback/PlayingContext', () => ({
  usePlayingActions: () => ({
    addCollectionToQueue: jest.fn(),
    shuffleCollectionToQueue: jest.fn(),
    getQueue: () => [],
    playSongInCollection: jest.fn(),
  }),
}));

jest.mock('@/features/offline/DownloadContext', () => ({
  useDownload: () => ({
    downloadAlbumById: jest.fn(),
    getCollectionDownloadState: () => ({ isDownloaded: false, isDownloading: false }),
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/features/sources/registry', () => ({
  useEnabledExternalSources: () => [],
}));

jest.mock('@/features/artist/useArtistAlbums', () => ({ useArtistAlbums: () => [] }));

jest.mock('./useLazyCollectionDetails', () => ({
  useLazyArtistSongs: () => ({ songs: [], songsLoading: false }),
}));

jest.mock('@/components/SpinningLoaderCircle', () => 'SpinningLoaderCircle');

jest.mock('@/features/shares/share', () => ({ shareItem: jest.fn() }));

jest.mock('@/components/options/OptionSheetPrimitives', () => {
  const { Text: RNText, View: RNView } = require('react-native');
  return {
    OptionSheetHeader: ({ title, subtitle }: any) => (
      <RNView>
        <RNText>{title}</RNText>
        {subtitle !== undefined && <RNText>{subtitle}</RNText>}
      </RNView>
    ),
    OptionSheetRow: ({ label, onPress }: any) => <RNText onPress={onPress}>{label}</RNText>,
    OptionSheetInfoRow: ({ label, value }: any) => <RNText>{label}: {value}</RNText>,
    OptionSheetSectionLabel: ({ label }: any) => <RNText>{label}</RNText>,
    OptionSheetDivider: () => <RNView />,
    optionSheetStyles: { sheetBackground: {}, sheetContent: {}, loading: {} },
    useOptionSheetBackground: () => ({}),
  };
});

const artist: Artist = {
  localId: 'local:artist:srv:server1:ar1' as Artist['localId'],
  nativeId: 'ar1',
  provenance: { origin: 'server', serverId: 'server1' },
  externalIds: {},
  libraryState: 'in-library',
  cover: { kind: 'none' },
  name: 'Some Artist',
  tags: [],
  albumIds: [],
};

describe('ArtistOptions', () => {
  beforeEach(() => {
    mockCanGeneratePlaylist.mockReset().mockReturnValue(false);
    mockGenerateForArtist.mockReset();
  });

  it('renders the base artist action set', async () => {
    const view = await render(<ArtistOptions ref={null as any} artist={artist} />);
    expect(view.getByText('artistOptions.actions.play')).toBeTruthy();
    expect(view.getByText('artistOptions.actions.shuffle')).toBeTruthy();
  });

  it('hides "Make a playlist from this" when the playlist.generate slot is unfilled', async () => {
    mockCanGeneratePlaylist.mockReturnValue(false);
    const view = await render(<ArtistOptions ref={null as any} artist={artist} />);
    expect(view.queryByText('artistOptions.actions.generatePlaylist')).toBeNull();
  });

  it('shows "Make a playlist from this" when the slot is filled', async () => {
    mockCanGeneratePlaylist.mockReturnValue(true);
    const view = await render(<ArtistOptions ref={null as any} artist={artist} />);
    expect(view.getByText('artistOptions.actions.generatePlaylist')).toBeTruthy();
  });

  /**
   * A browsed artist cannot be played, downloaded or queued from anyone's
   * library, so the library set would be a sheet of dead rows. What it gets is
   * what applies to the record itself — and, once artist wants land, Want.
   */
  describe('a browsed artist', () => {
    const external: Artist = {
      ...artist,
      localId: 'local:artist:ext:deezer:9' as Artist['localId'],
      nativeId: '9',
      provenance: { origin: 'integration', providerId: 'deezer' },
      libraryState: 'external',
      externalIds: { deezerId: '9' },
    };

    it('shares and opens the source page instead of the library actions', async () => {
      const { shareItem } = jest.requireMock('@/features/shares/share') as { shareItem: jest.Mock };
      shareItem.mockClear();

      const view = await render(<ArtistOptions ref={null as any} artist={external} />);

      expect(view.queryByText('artistOptions.actions.play')).toBeNull();
      expect(view.queryByText('artistOptions.actions.download')).toBeNull();
      expect(view.getByText('externalOptions.openInSource')).toBeTruthy();

      view.getByText('artistOptions.actions.share').props.onPress();
      expect(shareItem).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://www.deezer.com/artist/9' })
      );
    });

    it('offers nothing to take out of the app when no source identifies them', async () => {
      const view = await render(
        <ArtistOptions ref={null as any} artist={{ ...external, externalIds: {} }} />
      );

      expect(view.queryByText('artistOptions.actions.share')).toBeNull();
      expect(view.queryByText('externalOptions.openInSource')).toBeNull();
    });
  });
});
