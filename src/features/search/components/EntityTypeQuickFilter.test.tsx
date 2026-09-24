import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import EntityTypeQuickFilter from './EntityTypeQuickFilter';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { themeColor: '#f00', muted: '#eee', secondary: '#111' } }),
}));
jest.mock('@/features/theme/useRadius', () => ({
  useRadius: () => ({ pillFor: (size: number) => size / 2 }),
}));

/**
 * The quick row under the search field: promotes the same
 * `selectedEntityTypes`/`onToggle` the Filters sheet's own "Entity types"
 * section reads and writes, just surfaced one tap closer. See
 * `useSearchScreenModel`'s `showEntityTypeQuickFilter` for the gate that
 * decides when this renders at all.
 */
describe('EntityTypeQuickFilter', () => {
  it('renders all three entity types, marking the selected ones', () => {
    const view = render(
      <EntityTypeQuickFilter selectedEntityTypes={['song', 'album']} onToggle={jest.fn()} />
    );

    expect(view.getByTestId('search-entity-quick-filter-song').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('search-entity-quick-filter-album').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('search-entity-quick-filter-artist').props.accessibilityState).toEqual({ selected: false });
  });

  it('reports a tap on a pill as toggling that entity type', () => {
    const onToggle = jest.fn();
    const view = render(
      <EntityTypeQuickFilter selectedEntityTypes={['song', 'album', 'artist']} onToggle={onToggle} />
    );

    fireEvent.press(view.getByTestId('search-entity-quick-filter-artist'));

    expect(onToggle).toHaveBeenCalledWith('artist');
  });
});
