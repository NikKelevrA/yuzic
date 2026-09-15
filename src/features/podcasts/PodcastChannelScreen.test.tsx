import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { PodcastChannel, PodcastEpisode } from '@/providers/contracts/ServerAdapter';
import PodcastChannelScreen from './PodcastChannelScreen';

const mockPodcasts = { list: jest.fn(), downloadEpisode: jest.fn() };
const mockPlaySong = jest.fn();

jest.mock('lucide-react-native', () => new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : () => null) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
});
jest.mock('react-redux', () => ({ useSelector: () => ({ id: 'srv' }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ channelId: 'c1' }) }));
jest.mock('@/providers/registry/useApi', () => ({ useApi: () => ({ podcasts: mockPodcasts }) }));
jest.mock('@/features/playback/PlayingContext', () => ({ usePlayingActions: () => ({ playSong: mockPlaySong }) }));
jest.mock('@/features/theme/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('@/features/theme/useScrollClearance', () => ({ useScrollClearance: () => 0 }));
jest.mock('@/features/theme/useListDensity', () => ({ useListDensity: () => ({ rowPadding: 0 }) }));
jest.mock('@/components/toast', () => ({ notify: { error: jest.fn(), info: jest.fn() } }));
jest.mock('@/components/SkeletonListRow', () => 'SkeletonListRow');
jest.mock('@/components/SpinningLoaderCircle', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>downloading</Text> };
});
jest.mock('@/components/DetailHeader', () => {
  const { Text } = require('react-native');
  return { DetailHeaderBar: ({ title }: any) => <Text>{title}</Text> };
});
jest.mock('@/components/Touchable', () => {
  const { Pressable } = require('react-native');
  return { __esModule: true, default: (props: any) => <Pressable {...props} /> };
});
jest.mock('@/components/EmptyState', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ message }: any) => <Text>{message}</Text> };
});

const episode = (id: string, extra: Partial<PodcastEpisode> = {}): PodcastEpisode => ({
  id,
  streamId: null,
  channelId: 'c1',
  title: `Episode ${id}`,
  status: 'skipped',
  playableStreamId: null,
  cover: { kind: 'none' },
  ...extra,
});

const channel = (episodes: PodcastEpisode[]): PodcastChannel => ({
  id: 'c1',
  url: 'https://feeds.example/c1.xml',
  title: 'The Show',
  cover: { kind: 'none' },
  status: 'completed',
  episodes,
});

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PodcastChannelScreen />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockPodcasts.list.mockReset();
  mockPodcasts.downloadEpisode.mockReset();
  mockPlaySong.mockReset();
});

describe('PodcastChannelScreen', () => {
  it('plays a downloaded episode', async () => {
    mockPodcasts.list.mockResolvedValue([channel([episode('e1', { status: 'completed', playableStreamId: 'st1' })])]);
    const view = await renderScreen();

    fireEvent.press(await view.findByLabelText('podcasts.play'));

    expect(mockPlaySong).toHaveBeenCalledWith(expect.objectContaining({ title: 'Episode e1' }));
  });

  it('starts a download and shows it downloading straight away, without waiting on a timer', async () => {
    mockPodcasts.list
      .mockResolvedValueOnce([channel([episode('e1')])])
      .mockResolvedValue([channel([episode('e1', { status: 'downloading' })])]);
    mockPodcasts.downloadEpisode.mockResolvedValue(undefined);
    const view = await renderScreen();

    await act(async () => { fireEvent.press(await view.findByLabelText('podcasts.download')); });

    expect(mockPodcasts.downloadEpisode).toHaveBeenCalledWith('e1');
    await waitFor(() => expect(view.getByText('downloading')).toBeTruthy());
  });

  it('says so when the channel is gone', async () => {
    mockPodcasts.list.mockResolvedValue([]);
    const view = await renderScreen();

    await waitFor(() => expect(view.getByText('podcasts.notFound')).toBeTruthy());
  });
});
