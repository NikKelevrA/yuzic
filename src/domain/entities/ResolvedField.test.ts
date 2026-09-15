import { firstResolved, resolved } from './ResolvedField';

describe('firstResolved', () => {
  it('takes the first source that answered, not the best-looking answer', () => {
    // Order is the user's ranking. Picking a "better" value out of order would
    // silently override the preference they set.
    const picked = firstResolved([
      null,
      resolved('short bio', 'lastfm'),
      resolved('a much longer bio', 'deezer'),
    ]);

    expect(picked).toEqual({ value: 'short bio', sourceId: 'lastfm' });
  });

  it('skips a source that answered with nothing', () => {
    expect(firstResolved([resolved<string | null>(null, 'lastfm'), resolved('bio', 'deezer')]))
      .toEqual({ value: 'bio', sourceId: 'deezer' });
  });

  it('is null when nothing answered, so the caller keeps what it had', () => {
    expect(firstResolved([null, undefined])).toBeNull();
    expect(firstResolved([])).toBeNull();
  });

  it('keeps an empty string, which is an answer', () => {
    // A provider that genuinely reports "no tags" said something; that is
    // different from a provider that was never asked.
    expect(firstResolved([resolved('', 'lastfm'), resolved('bio', 'deezer')]))
      .toEqual({ value: '', sourceId: 'lastfm' });
  });
});
