import React, { type ReactNode } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import EqualizerSettings from './';
import settingsPlaybackReducer from '@/features/settings/playback/state';
import settingsAppearanceReducer from '@/features/settings/appearance/state';
import { EQ_PRESETS } from '@/features/player/audioSettings';

// Boundaries only: the screen, the equalizer card and the real playback slice
// render for real, so these fail when a control stops writing what it shows.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
// The native slider, as a host element whose props the test can drive.
jest.mock('@react-native-community/slider', () => 'Slider');

function makeStore() {
  return configureStore({
    reducer: {
      settingsPlayback: settingsPlaybackReducer,
      settingsAppearance: settingsAppearanceReducer,
    },
  });
}

async function renderScreen(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return render(<EqualizerSettings />, { wrapper: Wrapper });
}

const gainsOf = (store: ReturnType<typeof makeStore>) => store.getState().settingsPlayback.equalizerGains;

describe('EqualizerSettings', () => {
  it('writes a moved band to that band only, in whole decibels', async () => {
    const store = makeStore();
    const view = await renderScreen(store);

    const bands = view.getAllByLabelText('a11y.equalizer.band');
    expect(bands).toHaveLength(EQ_PRESETS[0].gains.length);
    await fireEvent(bands[2], 'valueChange', 3.6);

    expect(gainsOf(store)).toEqual([0, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('applies a preset, and marks it as the one in use', async () => {
    const store = makeStore();
    const view = await renderScreen(store);
    const bass = EQ_PRESETS.find(preset => preset.id === 'bass')!;

    await fireEvent.press(view.getByText(bass.labelKey));

    expect(gainsOf(store)).toEqual(bass.gains);
    const selected = view.getAllByRole('button').filter(button => button.props.accessibilityState?.selected);
    expect(selected).toHaveLength(1);
  });

  it('offers reset only once something is boosted or cut, and reset flattens every band', async () => {
    const store = makeStore();
    const view = await renderScreen(store);
    expect(view.queryByText('settings.player.equalizer.reset')).toBeNull();
    expect(view.getByText('settings.player.equalizer.flatSubtext')).toBeTruthy();

    await fireEvent(view.getAllByLabelText('a11y.equalizer.band')[0], 'valueChange', -5);
    await fireEvent.press(view.getByText('settings.player.equalizer.reset'));

    expect(gainsOf(store).every(gain => gain === 0)).toBe(true);
    expect(view.queryByText('settings.player.equalizer.reset')).toBeNull();
  });
});
