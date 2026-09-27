import React, { type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { BackgroundSelector } from './BackgroundSelector';
import settingsAppearanceReducer, { addProfile, editTheme, selectActiveTheme } from '../state';
import { ScreenBackgroundProvider } from '@/features/theme/ScreenBackground';
import { pickBackgroundImage, removeBackgroundImage } from '@/features/theme/backgroundImage';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/toast', () => ({ notify: { error: jest.fn() } }));
jest.mock('@/features/theme/backgroundImage', () => ({
  pickBackgroundImage: jest.fn(),
  removeBackgroundImage: jest.fn(async () => {}),
}));
let mockSong: { cover: { kind: 'url'; url: string } } | null = null;
jest.mock('@/features/playback/PlayingContext', () => ({ usePlayingState: () => ({ currentSong: mockSong }) }));
// The route decides how far the background reaches, so the tests drive it.
let mockSegments: string[] = ['(home)', '(tabs)', '(home)'];
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));
// The crop editor reaches react-native-gesture-handler, which this preset does
// not transform. Stubbed to a marker, so these tests can still say when the
// preview is on screen without pulling the gesture stack in.
jest.mock('./BackgroundCropEditor', () => {
  const { View } = require('react-native');
  return { BackgroundCropEditor: () => <View testID="crop-editor" /> };
});
jest.mock('@/providers/registry/covers', () => ({
  buildCover: (cover: { kind: string; url?: string }) => (cover.kind === 'url' ? cover.url : null),
}));

const pick = pickBackgroundImage as jest.MockedFunction<typeof pickBackgroundImage>;

function setup(ui: React.ReactElement) {
  const store = configureStore({ reducer: { settingsAppearance: settingsAppearanceReducer } });
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  Wrapper.displayName = 'TestStoreWrapper';
  return { store, view: render(ui, { wrapper: Wrapper }) };
}

const background = (store: ReturnType<typeof setup>['store']) => selectActiveTheme(store.getState()).surface.background;

beforeEach(() => {
  jest.clearAllMocks();
  mockSong = null;
  mockSegments = ['(home)', '(tabs)', '(home)'];
});

describe('BackgroundSelector', () => {
  it('asks for a photo when Photo is chosen, and keeps it', async () => {
    pick.mockResolvedValueOnce('file:///docs/theme/background-1.jpg');
    const { store, view } = setup(<BackgroundSelector />);
    const screen = await view;

    await act(async () => { fireEvent.press(screen.getByText('settings.appearance.background.image')); });

    expect(background(store)).toEqual({ kind: 'image', uri: 'file:///docs/theme/background-1.jpg' });
    expect(screen.getByText('settings.appearance.background.changePhoto')).toBeTruthy();
  });

  it('previews and re-frames a photo, and offers neither for a cover', async () => {
    // The preview is the only thing on this page that shows what any of its
    // settings do, and a cover has no framing to choose: it changes with the
    // track.
    const { store, view } = setup(<BackgroundSelector />);
    store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///docs/theme/background-1.jpg' } } }));
    const screen = await view;

    expect(screen.getByTestId('crop-editor')).toBeTruthy();
    expect(screen.getByText('settings.appearance.background.zoom')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText('settings.appearance.background.cover')); });

    expect(screen.queryByTestId('crop-editor')).toBeNull();
    expect(screen.queryByText('settings.appearance.background.zoom')).toBeNull();
  });

  it('offers to recentre only once the photo has been moved', async () => {
    const { store, view } = setup(<BackgroundSelector />);
    store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///a.jpg' } } }));
    const screen = await view;

    expect(screen.queryByText('settings.appearance.background.resetCrop')).toBeNull();

    await act(async () => {
      store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///a.jpg', crop: { x: 0.2, y: 0.5, zoom: 1 } } } }));
    });

    expect(screen.getByText('settings.appearance.background.resetCrop')).toBeTruthy();
  });

  it('keeps the photo when only its framing changes', async () => {
    // The old copy is deleted whenever the background stops pointing at it.
    // Re-framing points at the same file, so deleting here would blank the
    // background the moment it was adjusted.
    const { store, view } = setup(<BackgroundSelector />);
    store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///a.jpg' } } }));
    await view;

    await act(async () => {
      store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///a.jpg', crop: { x: 0.2, y: 0.5, zoom: 1.5 } } } }));
    });

    expect(removeBackgroundImage).not.toHaveBeenCalled();
    expect(background(store)).toEqual({ kind: 'image', uri: 'file:///a.jpg', crop: { x: 0.2, y: 0.5, zoom: 1.5 } });
  });

  it('gives a newly chosen photo its own framing rather than the last one\'s', async () => {
    const { store, view } = setup(<BackgroundSelector />);
    store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///a.jpg', crop: { x: 0, y: 1, zoom: 3 } } } }));
    const screen = await view;
    pick.mockResolvedValueOnce('file:///docs/theme/background-2.jpg');

    await act(async () => { fireEvent.press(screen.getByText('settings.appearance.background.changePhoto')); });

    expect(background(store)).toEqual({ kind: 'image', uri: 'file:///docs/theme/background-2.jpg' });
  });

  it('stays plain when the picker is cancelled', async () => {
    pick.mockResolvedValueOnce(null);
    const { store, view } = setup(<BackgroundSelector />);
    const screen = await view;

    await act(async () => { fireEvent.press(screen.getByText('settings.appearance.background.image')); });

    expect(background(store)).toEqual({ kind: 'none' });
  });

  it('keeps a photo another profile is still wearing', async () => {
    // The file is shared. Deleting it because this profile stopped pointing at
    // it would blank the other one's background too.
    const { store, view } = setup(<BackgroundSelector />);
    store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///shared.jpg' } } }));
    store.dispatch(addProfile({ name: 'Night' }));
    const screen = await view;

    await act(async () => { fireEvent.press(screen.getByText('settings.appearance.background.cover')); });

    expect(removeBackgroundImage).not.toHaveBeenCalled();
  });

  it('deletes the copied photo when it is no longer the background', async () => {
    const { store, view } = setup(<BackgroundSelector />);
    store.dispatch(editTheme({ surface: { background: { kind: 'image', uri: 'file:///docs/theme/background-1.jpg' } } }));
    const screen = await view;

    await act(async () => { fireEvent.press(screen.getByText('settings.appearance.background.cover')); });

    expect(background(store)).toEqual({ kind: 'cover' });
    expect(removeBackgroundImage).toHaveBeenCalledWith('file:///docs/theme/background-1.jpg');
  });

  it('shows the blur and dim sliders only when there is an image', async () => {
    const { store, view } = setup(<BackgroundSelector />);
    const screen = await view;
    expect(screen.queryByLabelText('settings.appearance.background.blur')).toBeNull();

    await act(async () => { store.dispatch(editTheme({ surface: { background: { kind: 'cover' } } })); });

    expect(screen.getByLabelText('settings.appearance.background.blur')).toBeTruthy();
    expect(screen.getByLabelText('settings.appearance.background.dim')).toBeTruthy();
  });
});

describe('ScreenBackground', () => {
  // The shapes `expo-router` really hands over for this app's route tree. A
  // trailing `index` is popped before `useSegments` sees it, so a tab root ends
  // in its own group — which is what these used to get wrong, in a way that
  // turned off every scope but the widest while the tests stayed green.
  const HOME = ['(home)', '(tabs)', '(home)'];
  const SEARCH = ['(home)', '(tabs)', '(search)'];
  // A shared `(home,search,library)` route resolves under the tab it was
  // pushed from, so the group is still `(home)` and the screen is the last.
  const ALBUM = ['(home)', '(tabs)', '(home)', 'albumView'];
  const SETTINGS = ['(home)', 'settings'];

  const Probe = () => <ScreenBackgroundProvider>{null}</ScreenBackgroundProvider>;

  it('draws nothing for a plain background', async () => {
    const { view } = setup(<Probe />);
    expect((await view).queryByTestId('screen-background')).toBeNull();
  });

  it('draws the cover of what is playing, and nothing when nothing is', async () => {
    const { store, view } = setup(<Probe />);
    store.dispatch(editTheme({ surface: { background: { kind: 'cover' } } }));
    const screen = await view;
    expect(screen.queryByTestId('screen-background')).toBeNull();

    mockSong = { cover: { kind: 'url', url: 'https://covers.test/1.jpg' } };
    await screen.rerender(<Probe />);
    expect(screen.getByTestId('screen-background')).toBeTruthy();
  });

  it('covers a sibling tab root, not just Home', async () => {
    // `home` used to be a third scope, covering the Home tab alone. It was
    // dropped: one tab wearing the photo and its two siblings not made the app
    // look half-themed. `tabs` is the narrow setting now, and it has to reach
    // Search and Library as well as Home.
    mockSong = { cover: { kind: 'url', url: 'https://covers.test/1.jpg' } };
    mockSegments = SEARCH;
    const { store, view } = setup(<Probe />);
    const screen = await view;
    await act(async () => {
      store.dispatch(editTheme({ surface: { background: { kind: 'cover' }, backgroundScope: 'tabs' } }));
    });
    expect(screen.getByTestId('screen-background')).toBeTruthy();
  });

  it('reaches a pushed screen only at the widest scope', async () => {
    // The gap this closes: "behind every tab" stopped at the three tab roots,
    // so an album, a playlist or settings never showed it.
    mockSong = { cover: { kind: 'url', url: 'https://covers.test/1.jpg' } };
    mockSegments = ALBUM;
    const { store, view } = setup(<Probe />);
    // The render is awaited before anything is dispatched into it. Acting on a
    // render still in flight passes here and breaks the *next* test: its own
    // `render` comes back attached to this tree, which cleanup has unmounted,
    // so every query finds nothing.
    const screen = await view;
    await act(async () => {
      store.dispatch(editTheme({ surface: { background: { kind: 'cover' }, backgroundScope: 'tabs' } }));
    });
    expect(screen.queryByTestId('screen-background')).toBeNull();

    await act(async () => { store.dispatch(editTheme({ surface: { backgroundScope: 'everywhere' } })); });
    expect(screen.getByTestId('screen-background')).toBeTruthy();

    mockSegments = HOME;
  });

  // What shipped broken: the Home tab root was not recognised as a tab root at
  // all, so the only setting that drew anything was the widest one. `tabs` is
  // the default now, and the Home tab root is one of the roots it must cover.
  it('draws on the Home tab root at the default scope', async () => {
    mockSong = { cover: { kind: 'url', url: 'https://covers.test/1.jpg' } };
    mockSegments = HOME;
    const { store, view } = setup(<Probe />);
    const screen = await view;
    await act(async () => { store.dispatch(editTheme({ surface: { background: { kind: 'cover' } } })); });

    expect(selectActiveTheme(store.getState()).surface.backgroundScope).toBe('tabs');
    expect(screen.getByTestId('screen-background')).toBeTruthy();
  });

  it('draws on the Home tab root when the router still spells out index', async () => {
    mockSong = { cover: { kind: 'url', url: 'https://covers.test/1.jpg' } };
    mockSegments = [...HOME, 'index'];
    const { store, view } = setup(<Probe />);
    const screen = await view;
    await act(async () => { store.dispatch(editTheme({ surface: { background: { kind: 'cover' } } })); });

    expect(screen.getByTestId('screen-background')).toBeTruthy();

    mockSegments = HOME;
  });

  it('leaves settings alone until the scope is widest', async () => {
    mockSong = { cover: { kind: 'url', url: 'https://covers.test/1.jpg' } };
    mockSegments = SETTINGS;
    const { store, view } = setup(<Probe />);
    const screen = await view;
    await act(async () => {
      store.dispatch(editTheme({ surface: { background: { kind: 'cover' }, backgroundScope: 'tabs' } }));
    });
    expect(screen.queryByTestId('screen-background')).toBeNull();

    await act(async () => { store.dispatch(editTheme({ surface: { backgroundScope: 'everywhere' } })); });
    expect(screen.getByTestId('screen-background')).toBeTruthy();

    mockSegments = HOME;
  });
});
