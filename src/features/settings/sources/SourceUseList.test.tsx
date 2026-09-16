import React, { type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import SourceUseList from './SourceUseList';
import settingsSourcesReducer, { setSourceUse } from './state';
import settingsAppearanceReducer from '@/features/settings/appearance/state';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ? `${key}:${options.name}` : key }),
}));
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

function makeStore() {
  return configureStore({
    reducer: { settingsSources: settingsSourcesReducer, settingsAppearance: settingsAppearanceReducer },
  });
}

type Store = ReturnType<typeof makeStore>;

async function renderList(store: Store, purpose: React.ComponentProps<typeof SourceUseList>['purpose']) {
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  Wrapper.displayName = 'TestStoreWrapper';
  const view = await render(<SourceUseList purpose={purpose} />, { wrapper: Wrapper });
  // The details sheet opens on the next frame.
  const flushFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
  return { view, flushFrame };
}

const uses = (store: Store) => store.getState().settingsSources.uses;

describe('SourceUseList', () => {
  it('lists every source for a purpose in the order they are tried', async () => {
    const { view } = await renderList(makeStore(), 'artwork');

    const ids = view.getAllByRole('switch').map(node => node.props.testID);
    expect(ids).toEqual([
      'source-use-coverartarchive.artwork',
      'source-use-deezer.artwork',
      // Answers only for radio stations, which neither of the two above can,
      // so its place at the end costs an album or artist lookup nothing.
      'source-use-radiobrowser.artwork',
    ]);
  });

  it('turns a use on at once, without asking again, and leaves the source’s other uses alone', async () => {
    const store = makeStore();
    const { view } = await renderList(store, 'artwork');

    await fireEvent(view.getByTestId('source-use-deezer.artwork'), 'valueChange', true);

    expect(uses(store)).toEqual({ 'deezer.artwork': true });
  });

  it('gives every row a labelled details button', async () => {
    const { view } = await renderList(makeStore(), 'artwork');

    expect(view.getByLabelText('a11y.settings.sourceDetails:settings.sources.deezer.name')).toBeTruthy();
    expect(view.getByLabelText('a11y.settings.sourceDetails:settings.sources.coverartarchive.name')).toBeTruthy();
  });

  it("opens a source's details — what it is sent and every use — where it can be stopped everywhere", async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'deezer.previews', enabled: true }));
    store.dispatch(setSourceUse({ use: 'deezer.artwork', enabled: true }));
    const { view, flushFrame } = await renderList(store, 'artwork');

    await fireEvent.press(view.getByTestId('source-use-details-deezer.artwork'));
    await flushFrame();

    expect(view.getByText('settings.sources.deezer.sends')).toBeTruthy();
    // Every use of the source, not just this purpose's.
    expect(view.getByTestId('source-sheet-use-deezer.search')).toBeTruthy();
    await fireEvent.press(view.getByText('settings.sources.stopUsing:settings.sources.deezer.name'));

    expect(uses(store)).toEqual({});
  });
});
