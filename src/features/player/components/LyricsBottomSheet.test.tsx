import React from 'react';
import { render } from '@testing-library/react-native';

import LyricsBottomSheet from './LyricsBottomSheet';
import type { LyricsResult } from '@/providers/contracts/ServerAdapter';

jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({
    colors: { secondary: '#000', subtext: '#666', border: '#ccc', background: '#fff' },
    isDarkMode: false,
  }),
}));

jest.mock('@/components/BottomSheetBackdrop', () => ({
  renderBackdrop: () => null,
}));

jest.mock('@/components/options/OptionSheetPrimitives', () => ({
  optionSheetStyles: { sheetBackground: {} },
  useOptionSheetBackground: () => ({}),
  useSheetBottomInset: () => 0,
}));

const mockSeekSong = jest.fn();
jest.mock('@/features/playback/PlayingContext', () => ({
  usePlayingProgress: () => ({ position: 0 }),
  usePlayingActions: () => ({ seekSong: mockSeekSong }),
}));

const synced = (lines: { startMs: number; text: string }[]): LyricsResult => ({
  synced: true,
  lines,
});

describe('LyricsBottomSheet', () => {
  beforeEach(() => {
    mockSeekSong.mockReset();
  });

  /**
   * The regression this guards: the sheet used to `return null` whenever
   * `lyrics` was falsy, which unmounted the whole `BottomSheetModal` — every
   * track change sets `lyrics` back to `null` while the new song's lyrics
   * resolve, so the sheet was closing itself on every single song, whether
   * or not the listener had touched it. Staying mounted (showing a loading
   * or empty state instead of vanishing) is what keeps it open across a
   * track change.
   */
  it('stays mounted and shows a loading state while lyrics are still resolving, rather than disappearing', () => {
    const { getByText, queryByText } = render(
      <LyricsBottomSheet lyrics={null} isResolving={true} onClose={jest.fn()} />
    );

    expect(getByText('playing.lyrics.title')).toBeTruthy();
    expect(getByText('playing.lyrics.loading')).toBeTruthy();
    expect(queryByText('playing.lyrics.none')).toBeNull();
  });

  it('stays mounted and shows a "none found" state once resolution finishes with nothing', () => {
    const { getByText, queryByText } = render(
      <LyricsBottomSheet lyrics={null} isResolving={false} onClose={jest.fn()} />
    );

    expect(getByText('playing.lyrics.title')).toBeTruthy();
    expect(getByText('playing.lyrics.none')).toBeTruthy();
    expect(queryByText('playing.lyrics.loading')).toBeNull();
  });

  it('renders the new song\'s lyric lines once they resolve', () => {
    const lyrics = synced([
      { startMs: 0, text: 'First line' },
      { startMs: 1000, text: 'Second line' },
    ]);

    const { getByText, queryByText } = render(
      <LyricsBottomSheet lyrics={lyrics} isResolving={false} onClose={jest.fn()} />
    );

    expect(getByText('First line')).toBeTruthy();
    expect(getByText('Second line')).toBeTruthy();
    expect(queryByText('playing.lyrics.none')).toBeNull();
    expect(queryByText('playing.lyrics.loading')).toBeNull();
  });
});
