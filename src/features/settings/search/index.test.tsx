import React, { type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import SearchSettings from './';
import settingsSearchReducer from './state';
import settingsSourcesReducer from '../sources/state';
import settingsAppearanceReducer from '@/features/settings/appearance/state';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ? `${key}:${options.name}` : key }),
}));
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

function makeStore() {
  return configureStore({
    reducer: {
      settingsSearch: settingsSearchReducer,
      settingsSources: settingsSourcesReducer,
      settingsAppearance: settingsAppearanceReducer,
    },
  });
}

async function renderScreen(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  Wrapper.displayName = 'TestStoreWrapper';
  return render(<SearchSettings />, { wrapper: Wrapper });
}

describe('SearchSettings', () => {
  it('writes where the library is searched', async () => {
    const store = makeStore();
    expect(store.getState().settingsSearch.searchScope).toBe('server');
    const view = await renderScreen(store);

    await fireEvent.press(view.getByText('settings.search.scope.client'));

    expect(store.getState().settingsSearch.searchScope).toBe('client');
  });

  it('switches outside sources on for search alone', async () => {
    const store = makeStore();
    const view = await renderScreen(store);

    expect(view.getAllByRole('switch').map(node => node.props.testID)).toEqual([
      'virtual-catalog-browsing',
      'source-use-deezer.search',
      'source-use-musicbrainz.search',
    ]);
    await fireEvent(view.getByTestId('source-use-musicbrainz.search'), 'valueChange', true);

    expect(store.getState().settingsSources.uses).toEqual({ 'musicbrainz.search': true });
  });

  it('writes whether virtual-catalog results are browsable, off by default', async () => {
    const store = makeStore();
    expect(store.getState().settingsSources.virtualCatalogBrowsingEnabled).toBe(false);
    const view = await renderScreen(store);

    await fireEvent(view.getByTestId('virtual-catalog-browsing'), 'valueChange', true);

    expect(store.getState().settingsSources.virtualCatalogBrowsingEnabled).toBe(true);
  });
});
