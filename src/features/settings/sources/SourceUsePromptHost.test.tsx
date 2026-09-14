import React, { type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import SourceUsePromptHost from './SourceUsePromptHost';
import { dismissSourceUsePrompt, promptSourceUse } from './sourceUsePrompt';
import settingsSourcesReducer from './state';
import settingsAppearanceReducer from '@/features/settings/appearance/state';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${Object.values(options).join('|')}` : key,
  }),
}));
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

function makeStore() {
  return configureStore({
    reducer: { settingsSources: settingsSourcesReducer, settingsAppearance: settingsAppearanceReducer },
  });
}

async function renderHost(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  Wrapper.displayName = 'TestStoreWrapper';
  return render(<SourceUsePromptHost />, { wrapper: Wrapper });
}

describe('SourceUsePromptHost', () => {
  // Awaited: an act left open here overlaps the next test’s render.
  afterEach(async () => {
    await act(async () => dismissSourceUsePrompt());
  });

  it('shows nothing until a feature asks', async () => {
    const view = await renderHost(makeStore());

    expect(view.queryByTestId('source-use-prompt-turn-on')).toBeNull();
  });

  it('asks where the use was needed, saying what it adds and what the source is sent', async () => {
    const view = await renderHost(makeStore());

    await act(async () => promptSourceUse('deezer.previews'));

    expect(view.getByText('settings.sources.promptTitle:settings.sourcePurposes.previews|settings.sources.deezer.name')).toBeTruthy();
    expect(view.getByText('settings.sourceUses.deezer.previews')).toBeTruthy();
    expect(view.getByText('settings.sources.deezer.sends')).toBeTruthy();
  });

  it('turns on only the use asked about', async () => {
    const store = makeStore();
    const view = await renderHost(store);

    await act(async () => promptSourceUse('deezer.previews'));
    await fireEvent.press(view.getByTestId('source-use-prompt-turn-on'));

    expect(store.getState().settingsSources.uses).toEqual({ 'deezer.previews': true });
    expect(view.queryByTestId('source-use-prompt-turn-on')).toBeNull();
  });

  it('finishes what the asker wanted once the use is on, and only then', async () => {
    const view = await renderHost(makeStore());
    const onTurnOn = jest.fn();

    await act(async () => promptSourceUse('deezer.previews', { onTurnOn }));
    expect(onTurnOn).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId('source-use-prompt-turn-on'));

    expect(onTurnOn).toHaveBeenCalledTimes(1);
  });

  it('does not run it when the answer is not now', async () => {
    const view = await renderHost(makeStore());
    const onTurnOn = jest.fn();

    await act(async () => promptSourceUse('deezer.previews', { onTurnOn }));
    await fireEvent.press(view.getByTestId('source-use-prompt-not-now'));

    expect(onTurnOn).not.toHaveBeenCalled();
  });

  it('changes nothing when the answer is not now', async () => {
    const store = makeStore();
    const view = await renderHost(store);

    await act(async () => promptSourceUse('deezer.previews'));
    await fireEvent.press(view.getByTestId('source-use-prompt-not-now'));

    expect(store.getState().settingsSources.uses).toEqual({});
    expect(view.queryByTestId('source-use-prompt-not-now')).toBeNull();
  });
});
