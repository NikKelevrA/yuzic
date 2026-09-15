import { BackHandler } from 'react-native';
import { act, render } from '@testing-library/react-native';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import { renderBackdrop } from './BottomSheetBackdrop';

jest.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetBackdrop: () => null,
  useBottomSheet: () => ({ close: mockClose }),
}));

// The reaction stands in for the UI thread: it hands the current open/closed
// state over when rendered, and again whenever a test moves the sheet.
jest.mock('react-native-reanimated', () => ({
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedReaction: (prepare: () => boolean, onChange: (value: boolean, previous: boolean | null) => void) => {
    const { useEffect } = require('react');
    const value = prepare();
    useEffect(() => { onChange(value, null); }, [value, onChange]);
  },
}));

/* eslint-disable no-var -- hoisted for the jest.mock factories above */
var mockClose = jest.fn();
/* eslint-enable no-var */

function backdropProps(index: number): BottomSheetBackdropProps {
  return {
    animatedIndex: { value: index },
    animatedPosition: { value: 0 },
    style: undefined,
  } as unknown as BottomSheetBackdropProps;
}

/** The back handlers the backdrop registered, and a spy on their removal. */
function captureBackHandler() {
  const remove = jest.fn();
  const handlers: (() => boolean | null | undefined)[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    handlers.push(listener);
    return { remove };
  });
  return { handlers, press: () => handlers[handlers.length - 1]?.(), remove };
}

describe('sheet backdrop and Android back', () => {
  beforeEach(() => {
    mockClose.mockClear();
    jest.restoreAllMocks();
  });

  it('closes the open sheet and keeps back from reaching the screen underneath', async () => {
    const back = captureBackHandler();
    await render(renderBackdrop(backdropProps(0)));

    expect(back.press()).toBe(true);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does not take back while its sheet is still closed', async () => {
    const back = captureBackHandler();
    await render(renderBackdrop(backdropProps(-1)));

    expect(back.handlers).toHaveLength(0);
  });

  it('starts listening once a sheet that mounted closed has opened, so the first press counts', async () => {
    const back = captureBackHandler();
    const view = await render(renderBackdrop(backdropProps(-1)));
    expect(back.handlers).toHaveLength(0);

    await act(async () => { view.rerender(renderBackdrop(backdropProps(0))); });

    expect(back.press()).toBe(true);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('stops listening once the sheet is gone', async () => {
    const back = captureBackHandler();
    const view = await render(renderBackdrop(backdropProps(0)));

    await view.unmount();

    expect(back.remove).toHaveBeenCalledTimes(1);
  });
});
