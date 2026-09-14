import React from 'react';
import { BackHandler } from 'react-native';
import { render } from '@testing-library/react-native';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import { renderBackdrop } from './BottomSheetBackdrop';

jest.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetBackdrop: () => null,
  useBottomSheet: () => ({ close: mockClose }),
}));

/* eslint-disable no-var -- hoisted for the jest.mock factory above */
var mockClose = jest.fn();
/* eslint-enable no-var */

function backdropProps(index: number): BottomSheetBackdropProps {
  return {
    animatedIndex: { value: index },
    animatedPosition: { value: 0 },
    style: undefined,
  } as unknown as BottomSheetBackdropProps;
}

/** The back handler the backdrop registered, and a spy on its removal. */
function captureBackHandler() {
  const remove = jest.fn();
  let handler: (() => boolean | null | undefined) | undefined;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    handler = listener;
    return { remove };
  });
  return { press: () => handler?.(), remove };
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

  it('lets back through while its sheet is already closing', async () => {
    const back = captureBackHandler();
    await render(renderBackdrop(backdropProps(-1)));

    expect(back.press()).toBe(false);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('stops listening once the sheet is gone', async () => {
    const back = captureBackHandler();
    const view = await render(renderBackdrop(backdropProps(0)));

    await view.unmount();

    expect(back.remove).toHaveBeenCalledTimes(1);
  });
});
