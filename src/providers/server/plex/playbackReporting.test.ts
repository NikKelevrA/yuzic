import { createPlexPlaybackReporter, scrobblePath, timelinePath } from './playbackReporting';
import type { PlexClient } from './client';

const track = (durationMs?: number) => ({
  MediaContainer: { Metadata: [{ type: 'track', ratingKey: '7', duration: durationMs }] },
});

const paramsOf = (path: string) => new URLSearchParams(path.slice(path.indexOf('?') + 1));

function makeReporter(respond: (path: string) => unknown = () => track(210_000)) {
  const request = jest.fn();
  request.mockImplementation(async (path: string) => respond(path));
  /** The calls that reported something, without the one-off duration lookup. */
  const reports = (): [string, { headers?: Record<string, string> }?][] =>
    request.mock.calls.filter(([path]) => String(path).startsWith('/:/'));
  return {
    reporter: createPlexPlaybackReporter({ request } as unknown as PlexClient),
    request,
    reports,
    lookups: () => request.mock.calls.filter(([path]) => String(path).startsWith('/library/metadata/')),
    sessions: () => reports().map(([, init]) => init?.headers?.['X-Plex-Session-Identifier']),
  };
}

describe('the URL Plex is told a play on', () => {
  it('marks a track played by its rating key, under the library that owns it', () => {
    // `key` is the bare rating key here and the metadata path on /:/timeline —
    // the two endpoints really do differ, which is how the path form survived
    // in a call that read as perfectly sensible. `identifier` names the plugin
    // the key belongs to; without it there is nobody to hand the key to, and
    // Plex answers 200 with an empty body all the same.
    expect(scrobblePath('7')).toBe('/:/scrobble?key=7&identifier=com.plexapp.plugins.library');
  });

  it('carries both spellings of the track, the library, the state and the two times', () => {
    expect(timelinePath({ ratingKey: '7', state: 'playing', timeMs: 42_000, durationMs: 210_000 })).toBe(
      '/:/timeline?ratingKey=7&key=%2Flibrary%2Fmetadata%2F7&identifier=com.plexapp.plugins.library'
      + '&state=playing&time=42000&duration=210000'
    );
  });

  it('leaves duration out rather than sending a length nobody measured', () => {
    // A zero duration is not "unknown" to Plex, it is a zero-length track: how
    // much was played is `time` against `duration`, so every listen would file
    // as a complete play of a track no time long.
    for (const durationMs of [undefined, 0, -1, Number.NaN]) {
      expect(paramsOf(timelinePath({ ratingKey: '7', state: 'stopped', timeMs: 1_000, durationMs })).has('duration'))
        .toBe(false);
    }
  });

  it('sends whole milliseconds, never a negative position', () => {
    const params = paramsOf(timelinePath({ ratingKey: '7', state: 'paused', timeMs: -5, durationMs: 210_000.7 }));
    expect(params.get('time')).toBe('0');
    expect(params.get('duration')).toBe('210001');
  });
});

describe('reporting a Plex playback', () => {
  it('asks Plex how long the track is, once, and puts it on every ping', async () => {
    // The duration is the one value `SongsApi`'s report calls are not given,
    // so it is fetched and kept for as long as that track is the one playing:
    // a heartbeat every ten seconds must not be a metadata request every ten
    // seconds.
    const { reporter, reports, lookups } = makeReporter();

    await reporter.nowPlaying('7');
    await reporter.progress('7', 30_000, false);
    await reporter.stop('7', 60_000);

    expect(lookups()).toEqual([['/library/metadata/7']]);
    expect(reports().map(([path]) => paramsOf(path).get('duration'))).toEqual(['210000', '210000', '210000']);
    expect(reports().map(([path]) => paramsOf(path).get('state'))).toEqual(['playing', 'playing', 'stopped']);
    expect(reports().map(([path]) => paramsOf(path).get('time'))).toEqual(['0', '30000', '60000']);
  });

  it('reads a duration the scanner put on the media part instead of the track', async () => {
    const { reporter, reports } = makeReporter(() => ({
      MediaContainer: { Metadata: [{ type: 'track', ratingKey: '7', Media: [{ duration: 195_000 }] }] },
    }));

    await reporter.nowPlaying('7');

    expect(paramsOf(reports()[0][0]).get('duration')).toBe('195000');
  });

  it('reports without a duration when Plex would not say, and asks again next ping', async () => {
    // Forgotten rather than remembered as "unknown", the way /identity is: one
    // failed lookup must not cost the whole track its duration.
    let failing = true;
    const { reporter, reports } = makeReporter(path => {
      if (path.startsWith('/library/metadata/') && failing) throw new Error('offline');
      return track(210_000);
    });

    await reporter.nowPlaying('7');
    failing = false;
    await reporter.progress('7', 30_000, false);

    expect(paramsOf(reports()[0][0]).has('duration')).toBe(false);
    expect(paramsOf(reports()[1][0]).get('duration')).toBe('210000');
  });

  it('says paused when it is paused, so the session is not left looking live', async () => {
    const { reporter, reports } = makeReporter();

    await reporter.progress('7', 12_000, true);

    expect(paramsOf(reports()[0][0]).get('state')).toBe('paused');
  });

  it('keeps one session identifier for one track, and starts another for the next', async () => {
    // Plex gathers a run of pings by X-Plex-Session-Identifier. The client id
    // beside it is the same for every play this install will ever make, so
    // without this each play is indistinguishable from the one before it.
    const { reporter, sessions } = makeReporter();

    await reporter.nowPlaying('7');
    await reporter.progress('7', 30_000, false);
    await reporter.stop('7', 60_000);
    await reporter.nowPlaying('8');

    const [first, second, stopped, next] = sessions();
    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(stopped).toBe(first);
    expect(next).not.toBe(first);
  });

  it('starts a new session after a stop, even for the same track played again', async () => {
    const { reporter, sessions } = makeReporter();

    await reporter.nowPlaying('7');
    await reporter.stop('7', 60_000);
    await reporter.nowPlaying('7');

    const [first, , again] = sessions();
    expect(again).not.toBe(first);
  });

  it('scrobbles without asking for a duration the endpoint has no parameter for', async () => {
    const { reporter, request } = makeReporter();

    await reporter.scrobble('7');

    expect(request.mock.calls).toEqual([['/:/scrobble?key=7&identifier=com.plexapp.plugins.library']]);
  });
});
