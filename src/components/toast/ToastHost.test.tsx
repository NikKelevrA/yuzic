import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import ToastHost from './ToastHost';
import { notify, __resetToasts } from './notify';
import { setToastClearance } from './clearance';
import { spacing } from '@/constants/design';

// Placement is the host's job; how one toast draws (and the gesture handler it
// pulls in, which jest here does not transform) is not under test.
jest.mock('./Toast', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: () => <View /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

function hostBottom(toJSON: () => unknown): number | undefined {
  const tree = toJSON() as { props: { style: unknown } } | null;
  if (!tree) return undefined;
  return (StyleSheet.flatten(tree.props.style) as { bottom?: number }).bottom;
}

/**
 * Toasts float above the tab dock, never on it.
 *
 * The host is mounted at the root, outside the tab navigator, so the tab-bar
 * height context it used to read was always empty there and it fell back to a
 * fixed guess — which put every toast on top of the playing bar. For as long as
 * one was up, a tap on the mini player landed on the toast and the player did
 * not open (found by detail-flows: the tap after starting a track never reached
 * the bar).
 */
describe('ToastHost placement', () => {
  beforeEach(() => {
    __resetToasts();
    setToastClearance(null);
  });

  it('sits above the height the dock reports, playing bar included', async () => {
    const dock = 152;
    const { toJSON } = await render(<ToastHost />);

    await act(async () => {
      setToastClearance(dock);
      notify.success('Playing similar');
    });

    expect(hostBottom(toJSON)).toBe(dock + spacing.md);
  });

  it('follows the dock when it grows or shrinks', async () => {
    const { toJSON } = await render(<ToastHost />);
    await act(async () => {
      setToastClearance(86);
      notify.success('Saved');
    });
    await act(async () => { setToastClearance(152); });

    expect(hostBottom(toJSON)).toBe(152 + spacing.md);
  });

  it('falls back to clearing the safe area where there is no dock', async () => {
    const { toJSON } = await render(<ToastHost />);
    await act(async () => { notify.success('Saved'); });

    expect(hostBottom(toJSON)).toBe(34 + spacing.xxxl + spacing.md);
  });
});
