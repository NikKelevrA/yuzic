import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import DownloadsScreen from './DownloadsScreen';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => (opts?.title ?? opts?.provider ?? key) }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

/* eslint-disable no-var -- hoisted for the jest.mock factory above */
var mockPush = jest.fn();
/* eslint-enable no-var */

jest.mock('react-redux', () => ({
  useSelector: (selector: any) => selector({}),
}));

jest.mock('@/features/theme/useScrollClearance', () => ({
  useScrollClearance: () => 0,
  useBottomOverlayHeight: () => 0,
}));

jest.mock('@/features/theme/useRadius', () => ({
  useRadius: () => ({ lg: 16, card: 8, thumb: 8, pill: 999, md: 8, pillFor: (n: number) => n / 2 }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', border: '#ccc', card: '#111', themeColor: '#0f0', background: '#fff', muted: '#eee' } }),
}));

const mockUseDownloadersQueue = jest.fn(() => ({ queues: [], totalInFlight: 0 }));
jest.mock('@/features/downloaders/DownloadersQueueContext', () => ({
  useDownloadersQueue: () => mockUseDownloadersQueue(),
}));

const mockUseDownloaderStates = jest.fn();
jest.mock('@/features/downloaders/registry', () => ({
  useDownloaderStates: () => mockUseDownloaderStates(),
}));

jest.mock('./DownloaderQueueSection', () => {
  const { Text: RNText } = require('react-native');
  return {
    __esModule: true,
    default: ({ id, title }: { id: string; title?: string }) => (
      <RNText testID={`downloader-queue-section-${id}`}>{title}</RNText>
    ),
  };
});

jest.mock('@/components/DetailHeader', () => {
  const { Text: RNText } = require('react-native');
  return { DetailHeaderBar: ({ title }: { title: string }) => <RNText>{title}</RNText> };
});

jest.mock('@/providers/integration/lidarr', () => ({ cancelQueueItem: jest.fn() }));
jest.mock('@/providers/integration/slskd', () => ({ cancelQueueItem: jest.fn() }));
jest.mock('@/providers/integration/soulsync', () => ({ cancelDownload: jest.fn() }));

function connectedState(id: 'lidarr' | 'slskd' | 'soulsync', label: string) {
  return {
    def: { id, label },
    config: { serverUrl: `http://${id}`, apiKey: 'key' },
    isConnected: true,
  };
}

describe('DownloadsScreen', () => {
  beforeEach(() => {
    mockUseDownloadersQueue.mockClear();
  });

  it('is server-transfers only: no offline section on this screen', async () => {
    mockUseDownloaderStates.mockReturnValue([]);
    const view = await render(<DownloadsScreen />);

    expect(view.queryByTestId('offline-section-mock')).toBeNull();
    // The empty state stands in for the (removed) section headers.
    expect(view.getByText('downloads.noDownloaders')).toBeTruthy();
  });

  it('shows every connected downloader, including SoulSync (previously omitted)', async () => {
    mockUseDownloaderStates.mockReturnValue([
      connectedState('lidarr', 'Lidarr'),
      connectedState('slskd', 'slskd'),
      connectedState('soulsync', 'SoulSync'),
    ]);

    const view = await render(<DownloadsScreen />);

    expect(view.getByTestId('downloader-queue-section-lidarr')).toBeTruthy();
    expect(view.getByTestId('downloader-queue-section-slskd')).toBeTruthy();
    expect(view.getByTestId('downloader-queue-section-soulsync')).toBeTruthy();
  });

  it('reads the shared useDownloadersQueue() context rather than spinning up its own poll', async () => {
    mockUseDownloaderStates.mockReturnValue([connectedState('lidarr', 'Lidarr')]);
    await render(<DownloadsScreen />);

    expect(mockUseDownloadersQueue).toHaveBeenCalled();
  });

  it('shows the empty state when nothing is connected, with the way to connect one', async () => {
    mockUseDownloaderStates.mockReturnValue([]);
    const view = await render(<DownloadsScreen />);

    expect(view.getByText('downloads.noDownloaders')).toBeTruthy();
    await fireEvent.press(view.getByText('downloads.setUpDownloader'));
    expect(mockPush).toHaveBeenCalledWith('/settings/connectionsView');
  });
});
