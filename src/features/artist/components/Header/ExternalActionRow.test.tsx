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

const mockPromptConnect = jest.fn();
jest.mock('@/features/downloaders/connectDownloaderPrompt', () => ({
  promptConnectDownloader: (...args: unknown[]) => mockPromptConnect(...args),
}));

const mockGetArtist = jest.fn();
let mockCanGetArtist = true;
jest.mock('@/features/wants/useWantGet', () => ({
  useWantGet: () => ({ canGetArtist: mockCanGetArtist, getArtist: mockGetArtist }),
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

  it('follows the artist, and saves the want that gives the request somewhere to report', async () => {
    const view = await render(<ExternalActionRow artist={artist} />);

    await press(view, 'a11y.detail.getArtist');

    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockGetArtist).toHaveBeenCalledWith({
      localId: 'local:artist:ext:1',
      name: 'New Order',
      mbid: 'mb-1',
    });
  });

  it('does not toggle a want that is already there — that would remove it', async () => {
    mockIsWanted = true;
    const view = await render(<ExternalActionRow artist={artist} />);

    await press(view, 'a11y.detail.getArtist');

    expect(mockToggle).not.toHaveBeenCalled();
    expect(mockGetArtist).toHaveBeenCalledTimes(1);
  });

  it('offers to connect a downloader instead of swallowing the tap', async () => {
    mockCanGetArtist = false;
    const view = await render(<ExternalActionRow artist={artist} />);

    await press(view, 'a11y.detail.getArtist');

    expect(mockPromptConnect).toHaveBeenCalledWith('artist');
    expect(mockGetArtist).not.toHaveBeenCalled();
  });

  it('draws nothing for an artist the library already holds', async () => {
    mockInLibrary = true;
    const view = await render(<ExternalActionRow artist={artist} />);

    expect(view.queryByLabelText('a11y.detail.getArtist')).toBeNull();
  });
});
