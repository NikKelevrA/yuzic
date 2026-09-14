import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import WantsScreen from './WantsScreen';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => (opts?.title ? `${key}:${opts.title}` : key) }),
}));

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: mockNavigate }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', background: '#fff' } }),
}));

jest.mock('@/features/theme/useScrollClearance', () => ({
  useScrollClearance: () => 0,
}));

jest.mock('@/features/theme/useRadius', () => ({
  useRadius: () => ({ lg: 16, card: 8, thumb: 8, pill: 999, md: 8, pillFor: (n: number) => n / 2 }),
}));

jest.mock('@/features/theme/useListDensity', () => ({
  useListDensity: () => ({ rowPadding: 8, rowGap: 8, trackRowPadding: 4 }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@/components/MediaImage', () => {
  const { View } = require('react-native');
  return { MediaImage: () => <View testID="media-image-mock" /> };
});

jest.mock('@/components/EmptyState', () => {
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ message, action }: any) => (
      <View>
        <Text>{message}</Text>
        {action ? (
          <Text testID="empty-action" onPress={action.onPress}>{action.label}</Text>
        ) : null}
      </View>
    ),
  };
});

let mockWants: any[] = [];
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useSelector: (selector: any) => selector({ __mockWants: true }),
  useDispatch: () => mockDispatch,
}));

jest.mock('@/state/redux/selectors/wantsSelectors', () => ({
  selectWantsForActiveServer: () => mockWants,
}));
jest.mock('@/state/redux/selectors/serversSelectors', () => ({
  selectActiveServerId: () => 'server-1',
}));
jest.mock('@/state/redux/slices/wantsSlice', () => ({
  removeWant: (payload: any) => ({ type: 'wants/removeWant', payload }),
}));

describe('WantsScreen', () => {
  beforeEach(() => {
    mockWants = [];
    mockNavigate.mockClear();
    mockDispatch.mockClear();
  });

  it('shows the empty state with zero providers/wants', async () => {
    const view = await render(<WantsScreen />);
    expect(view.getByText('wants.empty')).toBeTruthy();
  });

  it('lists every saved want', async () => {
    mockWants = [
      { localId: 'local:track:ext:manual:1', title: 'My Title', artist: 'My Artist', unit: 'track', origin: 'manual', createdAt: 1, updatedAt: 1 },
      { localId: 'local:album:ext:manual:2', title: 'Album Title', artist: 'Album Artist', unit: 'album', origin: 'manual', createdAt: 2, updatedAt: 2 },
    ];
    const view = await render(<WantsScreen />);

    expect(view.getAllByTestId('want-row')).toHaveLength(2);
    expect(view.getByText('My Title')).toBeTruthy();
    expect(view.getByText('Album Title')).toBeTruthy();
  });

  it('navigates to Search from the empty-state action', async () => {
    const view = await render(<WantsScreen />);
    fireEvent.press(view.getByTestId('empty-action'));

    expect(mockNavigate).toHaveBeenCalledWith('/(home)/(tabs)/(search)');
  });

  it('removes a want when its remove control is pressed', async () => {
    mockWants = [
      { localId: 'local:track:ext:manual:1', title: 'My Title', artist: 'My Artist', unit: 'track', origin: 'manual', createdAt: 1, updatedAt: 1 },
    ];
    const view = await render(<WantsScreen />);

    fireEvent.press(view.getByLabelText('a11y.wants.remove:My Title'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wants/removeWant',
      payload: { serverId: 'server-1', localId: 'local:track:ext:manual:1' },
    });
  });
});
