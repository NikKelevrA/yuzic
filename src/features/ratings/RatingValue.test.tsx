import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { themeColor: '#f36c7d', border: '#333' }, isDarkMode: true }),
}));

import RatingValue from './RatingValue';

describe('RatingValue', () => {
  it('says the rating out loud, because the stars themselves cannot', async () => {
    // It sits inside `OptionSheetRow`'s single Pressable, which groups its
    // children into one accessibility element and reads their labels. Without
    // this the row announces "Rating" and five silent glyphs.
    const view = await render(<RatingValue value={3} />);
    expect(view.getByLabelText('a11y.rating.star:3')).toBeTruthy();
  });

  it('distinguishes nothing rated from one star', async () => {
    const view = await render(<RatingValue value={undefined} />);
    expect(view.getByLabelText('ratings.notRated')).toBeTruthy();
  });

  it('has nothing a screen reader could try to press', async () => {
    // The whole reason the stars that *set* a rating live in their own sheet:
    // a control in here would be one a screen reader can see and never reach.
    const view = await render(<RatingValue value={4} />);
    expect(view.queryAllByRole('radio')).toHaveLength(0);
    expect(view.queryAllByRole('button')).toHaveLength(0);
  });
});
