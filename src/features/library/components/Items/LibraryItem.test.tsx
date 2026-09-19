import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import LibraryItem from './LibraryItem';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Kept, rather than stubbed away, so the radius the row asks for can be read.
jest.mock('@/components/MediaImage', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MediaImage: ({ style }: { style: unknown }) =>
      React.createElement(View, { testID: 'library-item-cover', style }),
  };
});

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666' }, isDarkMode: false }),
}));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ md: 8, card: 12 }) }));
jest.mock('@/features/theme/useListDensity', () => ({
  useListDensity: () => ({ libraryRowPadding: 8 }),
}));

const props = {
  cover: { uri: undefined } as never,
  title: 'Power, Corruption & Lies',
  subtext: 'New Order',
  isGridView: false,
  gridWidth: 160,
  onPress: jest.fn(),
  onLongPress: jest.fn(),
};

describe('LibraryItem', () => {
  it('is a button, and is named by the text it draws rather than by a label', async () => {
    const view = await render(<LibraryItem {...props} testID="row" />);

    const row = view.getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    // No label of its own: the title and artist it draws are the name, and a
    // label here would be a second copy of both to keep in step.
    expect(row.props.accessibilityLabel).toBeUndefined();
    expect(view.getByText('Power, Corruption & Lies')).toBeTruthy();
    expect(view.getByText('New Order')).toBeTruthy();
  });

  it('plays on a press and opens the options on a long press', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const view = await render(
      <LibraryItem {...props} onPress={onPress} onLongPress={onLongPress} testID="row" />
    );

    await fireEvent.press(view.getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await fireEvent(view.getByTestId('row'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  // `gridWidth / 2` and a literal `26` are the same mistake as a hardcoded
  // radius: a circle is a pill, and a pill is the one radius that must survive
  // the user choosing the `sharp` preset.
  it.each([
    ['a row', false],
    ['a grid cell', true],
  ])('draws circular artwork as a pill in %s', async (_name, isGridView) => {
    const view = await render(<LibraryItem {...props} isGridView={isGridView} circularImage />);

    expect(view.getByTestId('library-item-cover').props.style).toMatchObject({
      borderRadius: 999,
    });
  });
});
