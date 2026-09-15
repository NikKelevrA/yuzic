import { getCreatedForPlaylists } from './getCreatedForPlaylists';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

function jspfPlaylistStub(sourcePatch: string, title: string, mbid: string) {
  return {
    playlist: {
      title,
      identifier: `https://listenbrainz.org/playlist/${mbid}`,
      extension: {
        'https://musicbrainz.org/doc/jspf#playlist': {
          additional_metadata: {
            algorithm_metadata: { source_patch: sourcePatch },
          },
        },
      },
    },
  };
}

function fullPlaylistResponse(
  tracks: { title: string; creator: string; album?: string; identifier?: string[]; extension?: unknown }[]
) {
  return {
    playlist: {
      track: tracks,
    },
  };
}

function mockFetchSequence(responses: unknown[]) {
  let call = 0;
  global.fetch = jest.fn(async () => {
    const body = responses[call] ?? responses[responses.length - 1];
    call += 1;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => '',
    } as Response;
  }) as unknown as typeof fetch;
}

describe('getCreatedForPlaylists', () => {
  it('returns [] without a username — nobody to fetch for', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const result = await getCreatedForPlaylists(undefined);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns [] when the createdfor list is empty', async () => {
    mockFetchSequence([{ playlists: [] }]);
    const result = await getCreatedForPlaylists('listener');
    expect(result).toEqual([]);
  });

  it('filters to the three known mix types, ignoring anything else', async () => {
    mockFetchSequence([
      {
        playlists: [
          jspfPlaylistStub('daily-jams', 'Daily Jams for listener', 'mbid-1'),
          jspfPlaylistStub('some-other-bot-mix', 'Unrelated mix', 'mbid-2'),
        ],
      },
      fullPlaylistResponse([{ title: 'Song A', creator: 'Artist A' }]),
    ]);

    const result = await getCreatedForPlaylists('listener');

    expect(result).toHaveLength(1);
    expect(result[0].mixType).toBe('daily-jams');
  });

  it('fetches tracks for each matched mix and maps them to a domain Song', async () => {
    mockFetchSequence([
      {
        playlists: [
          jspfPlaylistStub('weekly-jams', 'Weekly Jams for listener', 'mbid-weekly'),
        ],
      },
      fullPlaylistResponse([
        {
          title: 'Track One',
          creator: 'Some Artist',
          identifier: ['https://musicbrainz.org/recording/11111111-1111-1111-1111-111111111111'],
        },
      ]),
    ]);

    const result = await getCreatedForPlaylists('listener');

    expect(result).toHaveLength(1);
    expect(result[0].tracks[0]).toMatchObject({
      title: 'Track One',
      artist: { name: 'Some Artist' },
      provenance: { origin: 'integration', providerId: 'musicbrainz' },
      externalIds: { mbid: '11111111-1111-1111-1111-111111111111' },
    });
  });

  it("uses the Cover Art Archive release ListenBrainz names as the track's own cover", async () => {
    mockFetchSequence([
      { playlists: [jspfPlaylistStub('daily-jams', 'Daily Jams', 'mbid-daily')] },
      fullPlaylistResponse([
        {
          title: 'Erase',
          creator: 'Ben Böhmer feat. lau.ra',
          album: 'Begin Again',
          extension: {
            'https://musicbrainz.org/doc/jspf#track': {
              additional_metadata: {
                artists: [
                  { artist_credit_name: 'Ben Böhmer', artist_mbid: 'e4f12dfc-1ee7-4250-8e24-549b6d46676d' },
                  { artist_credit_name: 'lau.ra', artist_mbid: 'b506a9db-0129-47d5-9ee1-cd78a73213f4' },
                ],
                caa_release_mbid: 'a7899fa9-cb47-499d-8eb4-a960c68d2d43',
              },
            },
          },
        },
      ]),
    ]);

    const [mix] = await getCreatedForPlaylists('listener');
    const track = mix.tracks[0];

    const releaseCover = { kind: 'coverartarchive', mbid: 'a7899fa9-cb47-499d-8eb4-a960c68d2d43', mbidType: 'release' };
    expect(track.cover).toEqual(releaseCover);
    expect(track.album.cover).toEqual(releaseCover);
    expect(track.album.externalIds).toEqual({ mbid: 'a7899fa9-cb47-499d-8eb4-a960c68d2d43', mbidType: 'release' });
    // The credit line is still what is shown; the picture is looked up by the first artist.
    expect(track.artist.name).toBe('Ben Böhmer feat. lau.ra');
    expect(track.artist.cover).toEqual({
      kind: 'none',
      subject: { kind: 'artist', name: 'Ben Böhmer', mbid: 'e4f12dfc-1ee7-4250-8e24-549b6d46676d' },
    });
  });

  it('leaves a track without release art as a gap named by its album and first credited artist', async () => {
    mockFetchSequence([
      { playlists: [jspfPlaylistStub('daily-jams', 'Daily Jams', 'mbid-daily')] },
      fullPlaylistResponse([
        {
          title: 'Song',
          creator: 'Main Artist feat. Guest',
          album: 'The Album',
          extension: {
            'https://musicbrainz.org/doc/jspf#track': {
              additional_metadata: { artists: [{ artist_credit_name: 'Main Artist' }, { artist_credit_name: 'Guest' }] },
            },
          },
        },
      ]),
    ]);

    const [mix] = await getCreatedForPlaylists('listener');

    expect(mix.tracks[0].cover).toEqual({
      kind: 'none',
      subject: { kind: 'album', title: 'The Album', artistName: 'Main Artist' },
    });
  });

  it('drops a matched mix that came back with no tracks', async () => {
    mockFetchSequence([
      {
        playlists: [
          jspfPlaylistStub('weekly-exploration', 'Weekly Exploration', 'mbid-explore'),
        ],
      },
      fullPlaylistResponse([]),
    ]);

    const result = await getCreatedForPlaylists('listener');
    expect(result).toEqual([]);
  });

  it('returns [] on a failed request rather than throwing', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' })) as unknown as typeof fetch;
    const result = await getCreatedForPlaylists('listener');
    expect(result).toEqual([]);
  });

  it('returns [] when fetch itself rejects', async () => {
    global.fetch = jest.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const result = await getCreatedForPlaylists('listener');
    expect(result).toEqual([]);
  });
});
