import React from 'react';
import { render } from '@testing-library/react-native';

import PlayerSettings from './index';

const mockDispatch = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/components/toast', () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/features/player/activeBackend', () => ({
  getBackend: () => ({ clearCache: jest.fn() }),
}));

jest.mock('@/api', () => ({
  useApi: () => ({ songs: { streamableCodecs: ['mp3'] } }),
}));

// Run the real selectors against a fixture state rather than stubbing the
// selector modules, so this test still fails if a selector's shape or default
// changes underneath the screen.
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: any) => unknown) => selector({
    settings: {
      preferredCodec: 'mp3',
      autoplayEnabled: true,
      resumeLongTracksEnabled: false,
    },
    // AudioMuse config is per-server, so the fixture needs both halves: an
    // active server id and that server's connection entry.
    servers: { activeServerId: 'server-1' },
    audiomuse: {
      byServer: {
        'server-1': { serverUrl: '', apiToken: '', isEnabled: false, isAuthenticated: false },
      },
    },
  }),
}));

jest.mock('@/utils/redux/slices/settingsSlice', () => ({
  setPreferredCodec: (payload: unknown) => ({ type: 'settings/setPreferredCodec', payload }),
  setAutoplayEnabled: (payload: unknown) => ({ type: 'settings/setAutoplayEnabled', payload }),
  setResumeLongTracksEnabled: (payload: unknown) => ({ type: 'settings/setResumeLongTracksEnabled', payload }),
}));

jest.mock('../components/SettingsScreen', () => {
  const { View } = require('react-native');
  function MockSettingsScreen({ children }: any) {
    return <View>{children}</View>;
  }
  return MockSettingsScreen;
});
jest.mock('../components/SettingsCard', () => {
  const { View } = require('react-native');
  function MockSettingsCard({ children }: any) {
    return <View>{children}</View>;
  }
  return MockSettingsCard;
});
jest.mock('../components/SettingsCardHeader', () => {
  const { Text } = require('react-native');
  function MockSettingsCardHeader({ title }: any) {
    return <Text testID={`header-${title}`}>{title}</Text>;
  }
  return MockSettingsCardHeader;
});
jest.mock('../components/SettingsRow', () => {
  const { Text } = require('react-native');
  function MockSettingsRow({ label }: any) {
    return <Text>{label}</Text>;
  }
  return MockSettingsRow;
});
jest.mock('../components/SettingsToggleGroup', () => {
  const { Text, View } = require('react-native');
  function MockSettingsToggleGroup({ items }: any) {
    return (
      <View testID="toggle-group">
        {items.map((item: any) => <Text key={item.label}>{item.label}</Text>)}
      </View>
    );
  }
  return MockSettingsToggleGroup;
});
jest.mock('./components/StreamingQuality', () => {
  const { Text } = require('react-native');
  function MockStreamingQuality() {
    return <Text testID="streaming-quality">streaming-quality</Text>;
  }
  return MockStreamingQuality;
});
jest.mock('./components/Crossfade', () => {
  const { Text } = require('react-native');
  function MockCrossfade() {
    return <Text testID="crossfade">crossfade</Text>;
  }
  return MockCrossfade;
});

describe('PlayerSettings', () => {
  beforeEach(() => mockDispatch.mockClear());

  it('shows the real player controls and no dev-only engine smoke-test panel', async () => {
    const view = await render(<PlayerSettings />);

    // Real controls are present.
    expect(view.getByTestId('streaming-quality')).toBeTruthy();
    expect(view.getByTestId('crossfade')).toBeTruthy();
    expect(view.getByText('settings.player.equalizer.title')).toBeTruthy();
    expect(view.getByText('settings.player.clearCache')).toBeTruthy();

    // The dev-only diagnostic panel (EngineSmokeTest) must not render.
    expect(view.queryByText('yuzic-engine (dev)')).toBeNull();
    expect(view.queryByTestId('header-yuzic-engine (dev)')).toBeNull();
  });
});
