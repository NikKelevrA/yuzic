import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import HomeSettings from './index';

const mockDispatch = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count ? `${key}.${options.count}` : key }),
}));
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: any) => unknown) => selector({
    settingsHome: {
      homeShelfVisibility: { quickPicks: false },
      homeShelfOrder: { resume: ['recentlyPlayed', 'quickPicks'] },
      homeShelfLength: 'standard',
      sleepTimerPresets: [5, 15],
    },
  }),
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
jest.mock('../components/SettingsSourceList', () => {
  const { Text, View } = require('react-native');
  function MockSettingsSourceList({ sources, sourceOrder, onOrderChange }: any) {
    return (
      <View testID={`source-list-${sources[0].id}`}>
        <Text>{sourceOrder.join(',')}</Text>
        {sources.map((source: any) => (
          <Text
            key={source.id}
            testID={`source-toggle-${source.id}`}
            onPress={() => source.onEnabledChange(!source.enabled)}
          >
            {source.label}
          </Text>
        ))}
        <Text testID={`reorder-${sources[0].id}`} onPress={() => onOrderChange([...sourceOrder].reverse())}>
          reorder
        </Text>
      </View>
    );
  }
  return MockSettingsSourceList;
});

describe('Home settings shelf editor', () => {
  beforeEach(() => mockDispatch.mockClear());

  it('groups each tier with one persisted reorder-and-visibility list', async () => {
    const view = await render(<HomeSettings />);

    expect(view.queryAllByText('settings.home.shelves.quickPicks')).toHaveLength(1);
    expect(view.getByText('recentlyPlayed,quickPicks,continuePlaying')).toBeTruthy();
    expect(view.queryAllByTestId('toggle-group')).toHaveLength(1);

    fireEvent.press(view.getByTestId('source-toggle-quickPicks'));
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { key: 'quickPicks', visible: true },
    }));

    fireEvent.press(view.getByTestId('reorder-quickPicks'));
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { tier: 'resume', order: ['continuePlaying', 'quickPicks', 'recentlyPlayed'] },
    }));
  });
});
