import React from 'react';
import { render } from '@testing-library/react-native';

import { DownloadsInProgressBanner } from './DownloadsInProgressBanner';

// Interpolated rather than returning the key, because what this is about is
// which downloaders get named and with what count.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'home.downloadsBanner.summaryItem') return `${opts?.count} on ${opts?.label}`;
      if (key === 'home.downloadsBanner.title') return `${opts?.count} downloads in progress`;
      return key;
    },
  }),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', muted: '#eee', themeColor: '#0f0' } }),
}));
jest.mock('@/features/theme/useRadius', () => ({
  useRadius: () => ({ card: 8, pill: 999 }),
}));

jest.mock('@/components/Touchable', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});
jest.mock('@/components/SpinningLoaderCircle', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return { CloudDownload: View };
});

const mockUseDownloadersQueue = jest.fn();
jest.mock('@/features/downloaders/DownloadersQueueContext', () => ({
  useDownloadersQueue: () => mockUseDownloadersQueue(),
}));

const queue = (id: string, label: string, count: number) => ({
  id, label, count, items: [], isLoading: false, hasError: false,
});

describe('DownloadsInProgressBanner', () => {
  it('names only the downloaders actually carrying something', async () => {
    // A connected-but-idle downloader keeps its entry in the shared queue
    // snapshot on purpose; this banner is about work in flight, so it read as
    // "0 on slskd" sitting beside a heading counting eleven downloads.
    mockUseDownloadersQueue.mockReturnValue({
      queues: [queue('lidarr', 'Lidarr', 11), queue('slskd', 'slskd', 0)],
      totalInFlight: 11,
    });

    const view = await render(<DownloadsInProgressBanner />);

    expect(view.getByText('11 downloads in progress')).toBeTruthy();
    expect(view.getByText('11 on Lidarr')).toBeTruthy();
    expect(view.queryByText(/slskd/)).toBeNull();
  });

  it('joins the downloaders that are, when there is more than one', async () => {
    mockUseDownloadersQueue.mockReturnValue({
      queues: [queue('lidarr', 'Lidarr', 11), queue('slskd', 'slskd', 2)],
      totalInFlight: 13,
    });

    const view = await render(<DownloadsInProgressBanner />);

    expect(view.getByText('11 on Lidarr · 2 on slskd')).toBeTruthy();
  });

  it('draws nothing at all when nothing is in flight', async () => {
    mockUseDownloadersQueue.mockReturnValue({
      queues: [queue('lidarr', 'Lidarr', 0)],
      totalInFlight: 0,
    });

    const view = await render(<DownloadsInProgressBanner />);

    expect(view.toJSON()).toBeNull();
  });
});
