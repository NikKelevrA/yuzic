import React from 'react';
import { render } from '@testing-library/react-native';

import SearchResultsBody from './SearchResultsBody';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { subtext: '#aaa', secondary: '#fff' } }),
}));
// Reads the appearance slice; these tests render the body without a store.
jest.mock('@/features/theme/useReducedMotion', () => ({ useReducedMotion: () => false }));
// Pulled in for the "Other sources" headers; importing it for real drags the
// whole provider registry and its server adapters into a render test.
jest.mock('@/features/sources/registry', () => ({
  getSourceMeta: (id: string) => ({ label: id, color: '#000' }),
}));
jest.mock('@/components/SkeletonListRow', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="skeleton-row" /> };
});
jest.mock('../browse/SearchBrowse', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="search-browse" /> };
});
jest.mock('./RecentSearches', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="recent-searches" /> };
});
jest.mock('./results/ResultRow', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ result }: any) => <Text>{result.title}</Text> };
});

/**
 * The empty-query branch is the whole point of the two-state search tab, and
 * nothing pinned it before: it was keyed on the field's focus, so every
 * keyboard dismissal swapped the body out from under the reader. These tests
 * exist so that behaviour cannot come back by accident.
 */
const baseModel = {
  query: '',
  isSearching: false,
  isLoading: false,
  isOtherScope: false,
  showSourceHeaders: false,
  recentQueries: [] as string[],
  recentEntities: [] as unknown[],
  libraryResults: [] as unknown[],
  externalResultsBySource: new Map<string, unknown[]>(),
  noResultsForScope: false,
  activeServerId: 'srv',
  navigation: {},
  navigateToAlbum: jest.fn(),
  navigateToArtist: jest.fn(),
  selectResult: jest.fn(),
  onSongPress: jest.fn(),
  onSongOptions: jest.fn(),
  onRecentQueryPress: jest.fn(),
  onRecentEntityPress: jest.fn(),
  onRemoveRecent: jest.fn(),
  onClearRecent: jest.fn(),
};

const renderBody = async (overrides: Partial<typeof baseModel> = {}) =>
  await render(<SearchResultsBody m={{ ...baseModel, ...overrides } as never} />);


describe('SearchResultsBody, empty query', () => {
  it('browses when the tab is not in its search state', async () => {
    const view = await renderBody({ recentQueries: ['nine inch nails'] });
    expect(view.getByTestId('search-browse')).toBeTruthy();
    expect(view.queryByTestId('recent-searches')).toBeNull();
  });

  it('shows recents once searching', async () => {
    const view = await renderBody({ isSearching: true, recentQueries: ['nine inch nails'] });
    expect(view.getByTestId('recent-searches')).toBeTruthy();
  });

  it('keeps recents up when the keyboard goes away', async () => {
    // The state is `isSearching`, not focus: a blur no longer changes the
    // model at all, so a re-render after one is the same screen. That is the
    // fix, and this is what pins it.
    const view = await renderBody({ isSearching: true, recentQueries: ['ugress'] });
    expect(view.getByTestId('recent-searches')).toBeTruthy();
    await view.rerender(<SearchResultsBody m={{ ...baseModel, isSearching: true, recentQueries: ['ugress'] } as never} />);
    expect(view.getByTestId('recent-searches')).toBeTruthy();
  });

  it('browses rather than showing a blank screen when searching with no history', async () => {
    const view = await renderBody({ isSearching: true });
    expect(view.getByTestId('search-browse')).toBeTruthy();
  });
});

describe('SearchResultsBody, with a query', () => {
  it('skeletons while loading', async () => {
    const view = await renderBody({ query: 'ugress', isSearching: true, isLoading: true });
    expect(view.getAllByTestId('skeleton-row')).toHaveLength(8);
    expect(view.queryByTestId('search-browse')).toBeNull();
  });

  it('lists library results in the library scope', async () => {
    const view = await renderBody({
      query: 'ugress',
      isSearching: true,
      libraryResults: [{ id: '1', type: 'album', title: 'Resound' }],
    });
    expect(view.getByText('Resound')).toBeTruthy();
  });

  it('says so when a scope has nothing', async () => {
    const view = await renderBody({ query: 'zzz', isSearching: true, noResultsForScope: true });
    expect(view.getByTestId('search-no-results')).toBeTruthy();
  });
});
