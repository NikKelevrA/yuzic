import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import HomeSettings from './';

const mockDispatch = jest.fn();
const mockPush = jest.fn();
let mockUses: Record<string, boolean> = {};
let mockListenBrainzUsername = '';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count ? `${key}.${options.count}` : key }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: any) => unknown) => selector({
    settingsHome: {
      homeShelfVisibility: { quickPicks: false },
      homeShelfOrder: { resume: ['recentlyPlayed', 'quickPicks'] },
      homeShelfLength: 'standard',
      sleepTimerPresets: [5, 15],
    },
    settingsSources: { uses: mockUses },
  }),
}));
jest.mock('@/state/redux/selectors/listenbrainzSelectors', () => ({
  selectListenBrainzUsername: () => mockListenBrainzUsername,
}));
// Its own test covers asking, allowing and stopping; here it only has to be
// where a source's switch goes.
jest.mock('../sources/SourceUseList', () => {
  const { Text } = require('react-native');
  function MockSourceUseList({ purpose, source }: any) {
    return <Text testID={`source-use-list-${purpose}-${source}`}>{source}</Text>;
  }
  return MockSourceUseList;
});
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
  function MockSettingsRow({ label, testID, onPress }: any) {
    return <Text testID={testID} onPress={onPress}>{label}</Text>;
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
            accessibilityState={{ checked: source.enabled }}
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
  beforeEach(() => {
    mockDispatch.mockClear();
    mockPush.mockClear();
    mockUses = {};
    mockListenBrainzUsername = '';
  });

  it("puts each outside tier's source switch at its head, and dims its shelves while that source is off", async () => {
    const view = await render(<HomeSettings />);

    // Home is local-first: nothing from your own library or server is gated.
    for (const tier of ['resume', 'library', 'server']) {
      expect(view.queryByTestId(`source-use-list-homeShelves-${tier}`)).toBeNull();
      expect(view.getByTestId(`home-tier-${tier}`).props.pointerEvents).toBe('auto');
    }
    for (const tier of ['listenbrainz', 'deezer']) {
      expect(view.getByTestId(`source-use-list-homeShelves-${tier}`)).toBeTruthy();
      // Hidden from screen readers as well as touch while its source is off.
      expect(view.queryByTestId(`home-tier-${tier}`)).toBeNull();
      expect(view.getByTestId(`home-tier-${tier}`, { includeHiddenElements: true }).props.pointerEvents).toBe('none');
    }
  });

  it("opens a tier's shelves once its source's Home use is on", async () => {
    mockUses = { 'deezer.homeShelves': true };
    const view = await render(<HomeSettings />);

    expect(view.getByTestId('home-tier-deezer').props.pointerEvents).toBe('auto');
    expect(view.getByTestId('home-tier-listenbrainz', { includeHiddenElements: true }).props.pointerEvents).toBe('none');
  });

  it('says the made-for-you shelves need an account, and leads to connecting one, instead of leaving them empty', async () => {
    mockUses = { 'listenbrainz.homeShelves': true };
    const view = await render(<HomeSettings />);

    expect(view.getByTestId('source-toggle-lbCreatedForDailyJams').props.accessibilityState).toEqual({ checked: false });
    expect(view.getByTestId('source-toggle-lbSimilarArtistsForYou').props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(view.getByTestId('home-listenbrainz-connect'));
    expect(mockPush).toHaveBeenCalledWith('/settings/listenbrainzView');
  });

  it('says nothing about an account once one is connected', async () => {
    mockUses = { 'listenbrainz.homeShelves': true };
    mockListenBrainzUsername = 'listener';
    const view = await render(<HomeSettings />);

    expect(view.queryByTestId('home-listenbrainz-connect')).toBeNull();
    expect(view.getByTestId('source-toggle-lbCreatedForDailyJams').props.accessibilityState).toEqual({ checked: true });
  });

  it('groups each tier with one persisted reorder-and-visibility list', async () => {
    const view = await render(<HomeSettings />);

    expect(view.queryAllByText('settings.home.shelves.quickPicks')).toHaveLength(1);
    expect(view.getByText('recentlyPlayed,quickPicks,continuePlaying')).toBeTruthy();
    expect(view.queryAllByTestId('toggle-group')).toHaveLength(1);

    await fireEvent.press(view.getByTestId('source-toggle-quickPicks'));
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { key: 'quickPicks', visible: true },
    }));

    await fireEvent.press(view.getByTestId('reorder-quickPicks'));
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { tier: 'resume', order: ['continuePlaying', 'quickPicks', 'recentlyPlayed'] },
    }));
  });
});
