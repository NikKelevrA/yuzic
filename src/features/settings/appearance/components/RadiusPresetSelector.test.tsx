import React from 'react';
import { render } from '@testing-library/react-native';

import { radius, scaleRadius, type RadiusPreset } from '@/constants/design';
import { RadiusPresetSelector } from './RadiusPresetSelector';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: () => unknown) => selector(),
}));

jest.mock('@/features/settings/appearance/state', () => ({
  selectRadiusPreset: () => 'default',
  selectThemeColor: () => '#ff7f7f',
  setRadiusPreset: (preset: string) => ({ type: 'appearance/setRadiusPreset', payload: preset }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', border: '#ccc', card: '#fff', muted: '#eee' }, isDarkMode: false }),
}));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ card: 12, md: 8 }) }));

describe('RadiusPresetSelector', () => {
  it('offers the presets as one radio group, not three lit buttons', async () => {
    const view = await render(<RadiusPresetSelector />);

    const options = view.getAllByRole('radio');
    expect(options).toHaveLength(3);
    // `checked` is the part a screen reader reads out; `selected` alone is
    // silent on Android, which is how all three read as unchosen.
    expect(options.filter(o => o.props.accessibilityState?.checked)).toHaveLength(1);
  });
});

describe('the preview swatches', () => {
  // What each 44pt swatch draws. They were 3/8/14 written out, which is this
  // expression evaluated by hand — so if a multiplier moves, this is what
  // catches the swatches silently disagreeing with the setting they preview.
  it.each([
    ['sharp', 3],
    ['default', 8],
    ['rounded', 14],
  ])('draws %s at %i', (preset, expected) => {
    expect(scaleRadius(radius.md, preset as RadiusPreset)).toBe(expected);
  });

  it('never squares off entirely, even at the sharpest preset', () => {
    expect(scaleRadius(radius.md, 'sharp')).toBeGreaterThan(0);
  });
});
