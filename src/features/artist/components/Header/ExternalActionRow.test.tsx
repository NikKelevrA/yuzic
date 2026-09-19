import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ExternalActionRow from './ExternalActionRow';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Host-component stubs, so the row can be driven through the labels it hands
// them rather than through their internals.
jest.mock('@/components/DetailHeader', () => ({
  DetailActionRow: 'DetailActionRow',
  DetailCircleAction: 'DetailCircleAction',
  DetailPlayAction: 'DetailPlayAction',
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000' }, isDarkMode: false }),
}));

const mockPresent = jest.fn();
jest.mock('@/components/useSheetRef', () => ({
  useSheetRef: () => ({ current: { present: mockPresent, dismiss: jest.fn() } }),
}));

// Captured rather than rendered: the review is its own suite, and reaching it
// pulls the bottom-sheet library in behind it.
const mockSheetProps = jest.fn();
jest.mock('@/features/wants/ArtistGetSheet', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: unknown) => {
      mockSheetProps(props);
      return <View testID="artist-get-sheet" />;
    },
  };
});

const mockPromptConnect = jest.fn();
jest.mock('@/features/downloaders/connectDownloaderPrompt', () => ({
  promptConnectDownloader: (...args: unknown[]) => mockPromptConnect(...args),
}));

let mockCanGetArtist = true;
jest.mock('@/features/wants/useWantGet', () => ({
  useWantGet: () => ({ canGetArtist: mockCanGetArtist, getArtist: jest.fn() }),
}));

const mockToggle = jest.fn();
let mockIsWanted = false;
jest.mock('@/features/entity-actions/shared/wantActions', () => ({
  useWantToggle: () => ({ isWanted: mockIsWanted, toggle: mockToggle }),
}));

let mockInLibrary = false;
jest.mock('@/features/library/useLocalFirst', () => ({
  useLocalFirst: () => ({ localArtist: () => (mockInLibrary ? { localId: 'local:artist:1' } : null) }),
}));

const artist = {
  localId: 'local:artist:ext:1',
  name: 'New Order',
  externalIds: { mbid: 'mb-1' },
  cover: { kind: 'none' },
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGetArtist = true;
  mockIsWanted = false;
  mockInLibrary = false;
});

type View = Awaited<ReturnType<typeof render>>;
const press = (view: View, label: string) => fireEvent.press(view.getByLabelText(label));

describe('an external artist screen', () => {
  it('offers Get and Want, which it never did before', async () => {
    const view = await render(<ExternalActionRow artist={artist} />);

    expect(view.getByLabelText('a11y.detail.getArtist')).toBeTruthy();
    expect(view.getByLabelText('a11y.detail.want')).toBeTruthy();
  });

  it('reviews the Get rather than firing it', async () => {
    const view = await render(<ExternalActionRow artist={artist} />);

    await press(view, 'a11y.detail.getArtist');

    expect(mockPresent).toHaveBeenCalledTimes(1);
    // Nothing is wanted or asked for on the way to the review — confirming is.
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('hands the review the artist, mbid included, so Lidarr can identify them', async () => {
    await render(<ExternalActionRow artist={artist} />);

    expect(mockSheetProps).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: expect.objectContaining({
          localId: 'local:artist:ext:1',
          name: 'New Order',
          mbid: 'mb-1',
        }),
      })
    );
  });

  it('saves the want on confirm, which is what gives the request somewhere to report', async () => {
    await render(<ExternalActionRow artist={artist} />);

    const { onConfirm } = mockSheetProps.mock.calls[0][0];
    onConfirm();

    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('does not toggle a want that is already there — that would remove it', async () => {
    mockIsWanted = true;
    await render(<ExternalActionRow artist={artist} />);

    const { onConfirm } = mockSheetProps.mock.calls[0][0];
    onConfirm();

    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('offers to connect a downloader instead of opening a review with no service in it', async () => {
    mockCanGetArtist = false;
    const view = await render(<ExternalActionRow artist={artist} />);

    await press(view, 'a11y.detail.getArtist');

    expect(mockPromptConnect).toHaveBeenCalledWith('artist');
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('draws nothing for an artist the library already holds', async () => {
    mockInLibrary = true;
    const view = await render(<ExternalActionRow artist={artist} />);

    expect(view.queryByLabelText('a11y.detail.getArtist')).toBeNull();
  });
});
