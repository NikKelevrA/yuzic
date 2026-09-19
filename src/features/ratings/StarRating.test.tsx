import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { themeColor: '#f36c7d', border: '#333' }, isDarkMode: true }),
}));

import StarRating from './StarRating';

type View = Awaited<ReturnType<typeof render>>;
const star = (view: View, index: number) => view.getByLabelText(`a11y.rating.star:${index}`);

describe('StarRating', () => {
  it('gives a screen reader one radio per star, with the rating checked', async () => {
    const view = await render(<StarRating value={3} onChange={jest.fn()} />);

    expect(star(view, 3).props.accessibilityState).toMatchObject({ checked: true });
    expect(star(view, 2).props.accessibilityState).toMatchObject({ checked: false });
    expect(star(view, 4).props.accessibilityState).toMatchObject({ checked: false });
  });

  it('rates the track when a star is pressed', async () => {
    const onChange = jest.fn();
    const view = await render(<StarRating value={undefined} onChange={onChange} />);

    fireEvent.press(star(view, 4));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('clears the rating when the star already set is pressed again', async () => {
    // The only way to take a rating off: there is no sixth control for it,
    // and one star is "I did not like it" rather than "I have not decided".
    const onChange = jest.fn();
    const view = await render(<StarRating value={2} onChange={onChange} />);

    fireEvent.press(star(view, 2));

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('draws nothing as checked when the server carries no rating for this', async () => {
    const view = await render(<StarRating value={undefined} onChange={jest.fn()} />);

    for (const index of [1, 2, 3, 4, 5]) {
      expect(star(view, index).props.accessibilityState).toMatchObject({ checked: false });
    }
  });
});
