import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { OptionSheetSwitchRow } from './OptionSheetPrimitives';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/MediaImage', () => ({ MediaImage: () => null }));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', themeColor: '#7c3aed' }, isDarkMode: false }),
}));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ sm: 6 }) }));

describe('OptionSheetSwitchRow', () => {
  it('is one control carrying the checked state, not a switch buried in a row', async () => {
    const view = await render(
      <OptionSheetSwitchRow
        testID="use-row"
        label="Artwork"
        description="Covers for albums your server has none for"
        value
        onValueChange={jest.fn()}
      />
    );

    const row = view.getByTestId('use-row');
    expect(row.props.accessibilityRole).toBe('switch');
    expect(row.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('toggles from a press anywhere on the row', async () => {
    const onValueChange = jest.fn();
    const view = await render(
      <OptionSheetSwitchRow testID="use-row" label="Artwork" value={false} onValueChange={onValueChange} />
    );

    await fireEvent.press(view.getByTestId('use-row'));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('turns back off from the same press', async () => {
    const onValueChange = jest.fn();
    const view = await render(
      <OptionSheetSwitchRow testID="use-row" label="Artwork" value onValueChange={onValueChange} />
    );

    await fireEvent.press(view.getByTestId('use-row'));

    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});
