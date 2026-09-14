import React, { type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import LyricsSettings from './';
import settingsLyricsReducer from './state';
import settingsAppearanceReducer from '@/features/settings/appearance/state';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The drag gesture is native; the list's own contract is covered in
// SettingsSourceList.test. Here each row renders as it would at rest.
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockDraggableList = ({ data, renderItem }: any) => (
    <View>
      {data.map((item: any, index: number) => (
        <React.Fragment key={item.id}>
          {renderItem({ item, getIndex: () => index, drag: jest.fn(), isActive: false })}
        </React.Fragment>
      ))}
    </View>
  );
  return MockDraggableList;
});

function makeStore() {
  return configureStore({
    reducer: {
      settingsLyrics: settingsLyricsReducer,
      settingsAppearance: settingsAppearanceReducer,
    },
  });
}

async function renderScreen(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return render(<LyricsSettings />, { wrapper: Wrapper });
}

describe('LyricsSettings', () => {
  it('shows the server as the fixed first source, with LRCLIB off by default', async () => {
    const store = makeStore();
    const view = await renderScreen(store);

    expect(view.getByText('settings.lyrics.serverEmbedded')).toBeTruthy();
    expect(view.getByText('settings.lyrics.lrclib')).toBeTruthy();
    expect(view.getByRole('switch').props.value).toBe(false);
  });

  it('turning LRCLIB on enables it and adds it to the try-order', async () => {
    const store = makeStore();
    const view = await renderScreen(store);

    await fireEvent(view.getByRole('switch'), 'valueChange', true);

    expect(store.getState().settingsLyrics.lyricsExternalSourcesEnabled).toEqual({ lrclib: true });
    expect(store.getState().settingsLyrics.lyricsExternalSourcesOrder).toEqual(['lrclib']);
  });
});
