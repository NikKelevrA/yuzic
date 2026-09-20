import { LIBRARY_IDENTIFIER, ratePath } from './urlCommands';

/**
 * A Plex write with no `identifier` is answered `200` with an empty body and
 * discarded, so these assert the URL rather than a response: the response
 * cannot tell the two apart, which is the whole reason this was wrong for so
 * long.
 */
describe('ratePath', () => {
  it('names the plugin, without which Plex has nothing to hand the key to', () => {
    expect(ratePath('12345', 10)).toContain(`identifier=${encodeURIComponent(LIBRARY_IDENTIFIER)}`);
  });

  it('addresses the track by its bare rating key, not its metadata path', () => {
    const path = ratePath('12345', 10);

    expect(path).toContain('key=12345');
    // The path form belongs to `/:/timeline` alone. Sent here it is a key Plex
    // will not resolve — and will not complain about.
    expect(path).not.toContain('library%2Fmetadata');
    expect(path).not.toContain('/library/metadata');
  });

  it('starts a favourite at the rating Plex reads favourites back from', () => {
    // `userRating=10` is what the favourites list filters on. If the write and
    // the read ever disagree, the list is silently always empty.
    expect(ratePath('7', 10)).toContain('rating=10');
  });

  it('clears a favourite with zero rather than by omitting the rating', () => {
    expect(ratePath('7', 0)).toContain('rating=0');
  });

  it('builds the whole command in the order Plex clients send it', () => {
    expect(ratePath('7', 10)).toBe(
      '/:/rate?key=7&identifier=com.plexapp.plugins.library&rating=10'
    );
  });

  it('escapes a rating key that needs it rather than pasting it in raw', () => {
    expect(ratePath('a b', 10)).toContain('key=a+b');
  });
});
