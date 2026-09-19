import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ArtistGetSheet from './ArtistGetSheet';

jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/BottomSheetBackdrop', () => ({ renderBackdrop: () => null }));
jest.mock('@/components/SpinningLoaderCircle', () => 'SpinningLoaderCircle');
jest.mock('@/components/options/RadioMark', () => 'RadioMark');

jest.mock('@/components/options/OptionSheetPrimitives', () => {
  const { Text: RNText, View: RNView } = require('react-native');
  return {
    OptionSheetHeader: ({ title }: any) => <RNText>{title}</RNText>,
    OptionSheetRow: ({ label, onPress, testID }: any) => (
      <RNText testID={testID ?? `row-${label}`} onPress={onPress}>{label}</RNText>
    ),
    OptionSheetSwitchRow: ({ label, value, onValueChange, testID }: any) => (
      <RNText testID={testID} onPress={() => onValueChange(!value)}>{`${label}:${value}`}</RNText>
    ),
    OptionSheetInfoRow: ({ label, value }: any) => <RNText>{label}: {value}</RNText>,
    OptionSheetSectionLabel: ({ label }: any) => <RNText>{label}</RNText>,
    OptionSheetDivider: () => <RNView />,
    optionSheetStyles: { sheetBackground: {} },
    useOptionSheetBackground: () => ({}),
    useOptionSheetContentStyle: () => ({}),
  };
});

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', border: '#ccc', background: '#fff', themeColor: '#7c3aed' } }),
}));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ card: 12 }) }));

jest.mock('react-redux', () => ({ useSelector: (fn: any) => fn() }));
jest.mock('@/state/redux/selectors/serversSelectors', () => ({
  selectActiveServer: () => ({ serverUrl: 'http://music.example' }),
}));

const mockGetArtist = jest.fn();
jest.mock('./useWantGet', () => ({
  useWantGet: () => ({ canGetArtist: true, getArtist: mockGetArtist }),
}));

const lidarr = {
  def: { id: 'lidarr', label: 'Lidarr', descriptionKey: 'lidarrDesc' },
  config: {},
  isConnected: true,
};
jest.mock('@/features/downloaders/registry', () => ({
  useDownloadersForUnit: () => [lidarr],
}));

const artist = {
  localId: 'local:artist:ext:1',
  name: 'New Order',
  mbid: 'mb-1',
  cover: { kind: 'none' },
} as never;

// `ref={sheetRef}` on the mocked class-component BottomSheetModal makes React
// overwrite `current` with the instance on mount, so a dismiss spy has to be
// attached after render — the same note `GetReviewSheet.test` carries.
const sheetRef = { current: null } as never;

beforeEach(() => { jest.clearAllMocks(); });

describe('ArtistGetSheet', () => {
  it('follows from now on unless told otherwise, and offers to search straight away', async () => {
    const view = await render(<ArtistGetSheet artist={artist} sheetRef={sheetRef} />);

    await fireEvent.press(view.getByTestId('artist-get-confirm'));

    expect(mockGetArtist).toHaveBeenCalledWith(
      expect.objectContaining({ monitor: 'future', search: true })
    );
  });

  it('warns that a future-only policy leaves the search nothing to find', async () => {
    const view = await render(<ArtistGetSheet artist={artist} sheetRef={sheetRef} />);

    expect(view.getByText('wants.getSheet.nothingToSearch')).toBeTruthy();
  });

  it('stops warning once a policy is picked that watches something', async () => {
    const view = await render(<ArtistGetSheet artist={artist} sheetRef={sheetRef} />);

    await fireEvent.press(view.getByTestId('artist-get-monitor-all'));

    expect(view.queryByText('wants.getSheet.nothingToSearch')).toBeNull();
  });

  it('passes on the back catalogue when that is what was chosen', async () => {
    const view = await render(<ArtistGetSheet artist={artist} sheetRef={sheetRef} />);

    await fireEvent.press(view.getByTestId('artist-get-monitor-all'));
    await fireEvent.press(view.getByTestId('artist-get-confirm'));

    expect(mockGetArtist).toHaveBeenCalledWith(
      expect.objectContaining({ monitor: 'all', search: true, name: 'New Order', mbid: 'mb-1' })
    );
  });

  it('lets the search be turned off without changing what is watched', async () => {
    const view = await render(<ArtistGetSheet artist={artist} sheetRef={sheetRef} />);

    await fireEvent.press(view.getByTestId('artist-get-search'));
    await fireEvent.press(view.getByTestId('artist-get-confirm'));

    expect(mockGetArtist).toHaveBeenCalledWith(
      expect.objectContaining({ monitor: 'future', search: false })
    );
  });

  it('closes on confirm and saves the want before the request goes out', async () => {
    const onConfirm = jest.fn();
    const ref = { current: null } as any;
    const view = await render(
      <ArtistGetSheet artist={artist} sheetRef={ref} onConfirm={onConfirm} />
    );
    const dismiss = jest.spyOn(ref.current, 'dismiss');

    await fireEvent.press(view.getByTestId('artist-get-confirm'));

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
