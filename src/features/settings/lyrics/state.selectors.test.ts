import reducer, { selectEnabledLyricsExternalSourcesInOrder } from './state';

/**
 * The selector used to `filter` on every call, so the song screen's
 * `useSelector` saw a new array for unchanged state — react-redux warned in
 * development and dumped the whole store into the log each time.
 */
describe('selectEnabledLyricsExternalSourcesInOrder', () => {
  const root = (settingsLyrics: ReturnType<typeof reducer>) => ({ settingsLyrics });

  it('returns the same array for the same state', () => {
    const state = root({
      ...reducer(undefined, { type: '@@init' }),
      lyricsExternalSourcesOrder: ['lrclib', 'musixmatch'],
      lyricsExternalSourcesEnabled: { lrclib: true },
    });

    const first = selectEnabledLyricsExternalSourcesInOrder(state);
    expect(first).toEqual(['lrclib']);
    expect(selectEnabledLyricsExternalSourcesInOrder(state)).toBe(first);
  });
});
