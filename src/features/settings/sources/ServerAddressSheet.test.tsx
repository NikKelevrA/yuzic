import React, { type ReactNode } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import ServerAddressSheet from './ServerAddressSheet';
import settingsSourcesReducer, { setSourceFallbackUrl, setSourceServerUrl } from './state';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockCheck = jest.fn();
jest.mock('@/providers/registry/serverAddress', () => ({
  checkServerAddress: (...args: unknown[]) => mockCheck(...args),
}));

// The form's own behaviour (present on mount, close after a save) is its own
// component's; what is under test here is what the sheet asks of it.
jest.mock('@/components/FormSheet', () => {
  const ReactLib = require('react');
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    FormSheet: ({ children, onSubmit, onClose }: { children: ReactNode; onSubmit: () => Promise<boolean>; onClose: () => void }) =>
      ReactLib.createElement(
        View,
        null,
        children,
        ReactLib.createElement(
          Pressable,
          { testID: 'submit', onPress: async () => { if (await onSubmit()) onClose(); } },
          ReactLib.createElement(Text, null, 'save')
        )
      ),
    FormSheetField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (text: string) => void }) =>
      ReactLib.createElement(TextInput, {
        testID: label.includes('fallback') ? 'fallback-field' : 'field',
        value,
        onChangeText,
      }),
  };
});

function makeStore() {
  return configureStore({ reducer: { settingsSources: settingsSourcesReducer } });
}

async function renderSheet(store: ReturnType<typeof makeStore>, onClose = jest.fn()) {
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  Wrapper.displayName = 'TestStoreWrapper';
  const view = await render(<ServerAddressSheet source="musicbrainz" onClose={onClose} />, { wrapper: Wrapper });
  return { view, onClose };
}

const saved = (store: ReturnType<typeof makeStore>) => store.getState().settingsSources.serverUrls;
const savedFallback = (store: ReturnType<typeof makeStore>) => store.getState().settingsSources.fallbackUrls;

describe('ServerAddressSheet', () => {
  beforeEach(() => mockCheck.mockReset());

  it('keeps the address that was typed and says so when it is not a web address', async () => {
    mockCheck.mockResolvedValue({ ok: false, reason: 'invalid' });
    const store = makeStore();
    const { view, onClose } = await renderSheet(store);

    await fireEvent.changeText(view.getByTestId('field'), 'nas:5000');
    await fireEvent.press(view.getByTestId('submit'));

    await waitFor(() => expect(view.getByTestId('server-address-problem')).toBeTruthy());
    expect(view.getByText('settings.sources.serverAddress.invalid')).toBeTruthy();
    expect(view.getByTestId('field').props.value).toBe('nas:5000');
    expect(saved(store)).toEqual({});
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not save a server that does not answer', async () => {
    mockCheck.mockResolvedValue({ ok: false, reason: 'unreachable' });
    const store = makeStore();
    const { view } = await renderSheet(store);

    await fireEvent.changeText(view.getByTestId('field'), 'http://nas:5000');
    await fireEvent.press(view.getByTestId('submit'));

    await waitFor(() => expect(view.getByText('settings.sources.serverAddress.unreachable')).toBeTruthy());
    expect(saved(store)).toEqual({});
  });

  it('saves the checked address and closes', async () => {
    mockCheck.mockResolvedValue({ ok: true, address: 'http://nas:5000' });
    const store = makeStore();
    const { view, onClose } = await renderSheet(store);

    await fireEvent.changeText(view.getByTestId('field'), ' http://nas:5000/ ');
    await fireEvent.press(view.getByTestId('submit'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCheck).toHaveBeenCalledWith('musicbrainz', ' http://nas:5000/ ');
    expect(saved(store)).toEqual({ musicbrainz: 'http://nas:5000' });
  });

  it('clears an address without asking anything of the network', async () => {
    const store = makeStore();
    store.dispatch(setSourceServerUrl({ source: 'musicbrainz', url: 'http://nas:5000' }));
    const { view, onClose } = await renderSheet(store);

    await fireEvent.changeText(view.getByTestId('field'), '');
    await fireEvent.press(view.getByTestId('submit'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCheck).not.toHaveBeenCalled();
    expect(saved(store)).toEqual({});
  });

  it('takes the problem away once the address is edited', async () => {
    mockCheck.mockResolvedValue({ ok: false, reason: 'invalid' });
    const { view } = await renderSheet(makeStore());

    await fireEvent.changeText(view.getByTestId('field'), 'nas');
    await fireEvent.press(view.getByTestId('submit'));
    await waitFor(() => expect(view.getByTestId('server-address-problem')).toBeTruthy());

    await fireEvent.changeText(view.getByTestId('field'), 'http://nas:5000');

    expect(view.queryByTestId('server-address-problem')).toBeNull();
  });

  describe('fallback address', () => {
    it('saves a fallback beside the address', async () => {
      mockCheck.mockResolvedValue({ ok: true, address: 'http://192.168.1.43:5001' });
      const store = makeStore();
      const { view, onClose } = await renderSheet(store);

      await fireEvent.changeText(view.getByTestId('field'), 'http://192.168.1.43:5001');
      await fireEvent.changeText(view.getByTestId('fallback-field'), ' http://100.64.0.1:5001/ ');
      await fireEvent.press(view.getByTestId('submit'));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(saved(store)).toEqual({ musicbrainz: 'http://192.168.1.43:5001' });
      expect(savedFallback(store)).toEqual({ musicbrainz: 'http://100.64.0.1:5001' });
    });

    it('says so, and saves nothing, when the fallback is not a web address', async () => {
      mockCheck.mockResolvedValue({ ok: true, address: 'http://nas:5000' });
      const store = makeStore();
      const { view, onClose } = await renderSheet(store);

      await fireEvent.changeText(view.getByTestId('field'), 'http://nas:5000');
      await fireEvent.changeText(view.getByTestId('fallback-field'), 'tailscale');
      await fireEvent.press(view.getByTestId('submit'));

      await waitFor(() => expect(view.getByText('settings.sources.serverAddress.fallbackInvalid')).toBeTruthy());
      expect(saved(store)).toEqual({});
      expect(savedFallback(store)).toEqual({});
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not ask the network about the fallback, nor about an address that did not change', async () => {
      const store = makeStore();
      store.dispatch(setSourceServerUrl({ source: 'musicbrainz', url: 'http://nas:5000' }));
      const { view, onClose } = await renderSheet(store);

      await fireEvent.changeText(view.getByTestId('fallback-field'), 'http://100.64.0.1:5000');
      await fireEvent.press(view.getByTestId('submit'));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mockCheck).not.toHaveBeenCalled();
      expect(savedFallback(store)).toEqual({ musicbrainz: 'http://100.64.0.1:5000' });
    });

    it('removes the fallback when it is emptied', async () => {
      const store = makeStore();
      store.dispatch(setSourceServerUrl({ source: 'musicbrainz', url: 'http://nas:5000' }));
      store.dispatch(setSourceFallbackUrl({ source: 'musicbrainz', url: 'http://100.64.0.1:5000' }));
      const { view, onClose } = await renderSheet(store);

      await fireEvent.changeText(view.getByTestId('fallback-field'), '');
      await fireEvent.press(view.getByTestId('submit'));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(savedFallback(store)).toEqual({});
      expect(saved(store)).toEqual({ musicbrainz: 'http://nas:5000' });
    });

    it('goes with the address when the address is cleared', async () => {
      const store = makeStore();
      store.dispatch(setSourceServerUrl({ source: 'musicbrainz', url: 'http://nas:5000' }));
      store.dispatch(setSourceFallbackUrl({ source: 'musicbrainz', url: 'http://100.64.0.1:5000' }));
      const { view, onClose } = await renderSheet(store);

      await fireEvent.changeText(view.getByTestId('field'), '');
      await fireEvent.press(view.getByTestId('submit'));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(saved(store)).toEqual({});
      expect(savedFallback(store)).toEqual({});
    });
  });
});
