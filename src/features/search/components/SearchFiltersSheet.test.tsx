import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import SearchFiltersSheet from './SearchFiltersSheet';

const mockDispatch = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ? `${key}:${options.name}` : key }),
}));
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const Pass = ({ children }: any) => <View>{children}</View>;
  return { BottomSheetModal: Pass, BottomSheetScrollView: Pass };
});
jest.mock('@/components/BottomSheetBackdrop', () => ({ renderBackdrop: () => null }));
jest.mock('@/features/theme/useTheme', () => ({ useTheme: () => ({ colors: { border: '#333', secondary: '#fff', subtext: '#aaa', themeColor: '#f00' } }) }));
jest.mock('@/components/options/OptionSheetPrimitives', () => {
  const { Text, View } = require('react-native');
  return {
    OptionSheetDivider: () => null,
    OptionSheetSectionLabel: ({ label }: any) => <Text>{label}</Text>,
    OptionSheetRow: ({ label, description, onPress, trailing, testID }: any) => (
      <View testID={testID}>
        <Text onPress={onPress}>{label}</Text>
        {description ? <Text>{description}</Text> : null}
        {trailing}
      </View>
    ),
    optionSheetStyles: {},
    useOptionSheetBackground: () => ({}),
  };
});
jest.mock('@/features/sources/registry', () => ({
  getSourceMeta: (id: string) => ({ label: id === 'deezer' ? 'Deezer' : 'MusicBrainz', color: '#000' }),
}));

async function renderSheet(props: Partial<React.ComponentProps<typeof SearchFiltersSheet>> = {}) {
  const onToggleSource = jest.fn();
  const view = await render(
    <SearchFiltersSheet
      resultScope="other"
      onChangeScope={jest.fn()}
      availableSourceIds={[]}
      selectedSourceIds={[]}
      onToggleSource={onToggleSource}
      selectedEntityTypes={['album', 'artist']}
      onToggleEntityType={jest.fn()}
      {...props}
    />
  );
  return { view, onToggleSource };
}

/**
 * "Other sources" with nothing turned on used to be a dead end: a line
 * telling you to leave the search and go find a setting.
 */
describe('SearchFiltersSheet sources', () => {
  beforeEach(() => mockDispatch.mockClear());

  it('offers each source that is off with a switch saying what it sends', async () => {
    const { view } = await renderSheet({ availableSourceIds: ['deezer'], selectedSourceIds: ['deezer'] });

    expect(view.getByTestId('search-filters-source-deezer')).toBeTruthy();
    expect(view.queryByTestId('search-filters-enable-deezer')).toBeNull();
    expect(view.getByTestId('search-filters-enable-musicbrainz')).toBeTruthy();
    expect(view.getByText('search.filters.sendsQuery:MusicBrainz')).toBeTruthy();
    expect(view.getByText('search.filters.alsoInSettings')).toBeTruthy();
  });

  it('turns a source on for search and puts it in this search', async () => {
    const { view, onToggleSource } = await renderSheet();

    fireEvent(view.getByTestId('search-filters-enable-switch-deezer'), 'valueChange', true);

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { sourceId: 'deezer', enabled: true },
    }));
    expect(onToggleSource).toHaveBeenCalledWith('deezer');
  });

  it('has no switches or settings note once every source is on', async () => {
    const { view } = await renderSheet({ availableSourceIds: ['deezer', 'musicbrainz'] });

    expect(view.queryAllByRole('switch')).toHaveLength(0);
    expect(view.queryByText('search.filters.alsoInSettings')).toBeNull();
  });
});
