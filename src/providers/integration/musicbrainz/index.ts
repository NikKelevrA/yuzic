import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import { createRateLimiter } from '@/providers/http/rateLimit';
import { orderedUrls, tryWithFailover, UrlTimeoutError } from '@/providers/http/urlFailover';

const PUBLIC_BASE = 'https://musicbrainz.org/ws/2';
const HEADERS = {
  'User-Agent': 'yuzic/1.0 (https://github.com/yuzic)',
  'Accept': 'application/json',
};

/**
 * MusicBrainz allows one request per second per client and answers anything
 * faster with 503. Every call in the app shares this line — search, enrichment
 * and release lookups alike — because the limit is per client, not per feature.
 */
const MUSICBRAINZ_MIN_INTERVAL_MS = 1100;

/** Where a MusicBrainz server of your own is, when you run one. */
type MusicbrainzConfig = {
  serverUrl?: string;
  /** Other addresses of the same server, tried in order when the first does not answer. */
  fallbackUrls?: string[];
};

/** The one server of your own there is, for remembering which of its addresses answered last. */
const FAILOVER_ID = 'musicbrainz';

/**
 * How long an address gets to answer when another is waiting behind it. Long
 * enough for a slow query on a busy server, short enough that a phone away
 * from home is not stuck for the full request deadline on a LAN address that
 * can never answer. The last address keeps the full deadline.
 */
const FAILOVER_ATTEMPT_TIMEOUT_MS = 8_000;

/**
 * The web service under a server's root address, which is what the user
 * enters — `http://host:5000`, the way Lidarr and AudioMuse-AI are set up. A
 * trailing slash, or a `/ws/2` pasted along with the address, is tidied away
 * rather than sent on to fail.
 */
function baseOf(serverUrl: string): string {
  return `${serverUrl.trim().replace(/\/+$/, '').replace(/\/ws\/2$/, '')}/ws/2`;
}

export type MbArtist = {
  id: string;
  name: string;
  score?: number;
  annotation?: string;
  'release-groups'?: MbReleaseGroup[];
};

export type MbReleaseGroup = {
  id: string;
  title: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  'artist-credit'?: { name?: string; artist: { id?: string; name: string } }[];
};

export type MbTrack = {
  id: string;
  title: string;
  length: number | null;
  position: number;
  recording?: { id: string };
  'artist-credit'?: { name?: string; artist: { id?: string; name: string } }[];
};

/**
 * A recording as MusicBrainz's search index returns it, not as the lookup API
 * shapes one: `id`/`title`/`artist-credit` sit at the top level (no nested
 * `recording` the way {@link MbTrack} carries one from a release), and each of
 * its `releases` embeds a basic `release-group` already, because a search hit
 * is pre-joined rather than assembled from an `inc` list.
 */
export type MbRecordingHit = {
  id: string;
  title: string;
  length?: number | null;
  'artist-credit'?: { name?: string; artist: { id?: string; name: string } }[];
  releases?: {
    id: string;
    title: string;
    date?: string;
    status?: string;
    'release-group'?: MbReleaseGroup;
  }[];
};

type MbRelease = {
  id: string;
  title: string;
  media: { tracks: MbTrack[] }[];
};

/**
 * A MusicBrainz client that closes over its own address and its own limiter.
 *
 * Both are per client because both depend on where it points. The public
 * server is spaced at {@link MUSICBRAINZ_MIN_INTERVAL_MS}; a server of your
 * own has no limit to respect, so its client is not spaced at all and
 * search-as-you-type is as fast as the server is. Without an address the
 * client is the public one, exactly as before.
 *
 * The User-Agent stays the same on a server of your own: it costs nothing and
 * keeps one code path. Cover Art Archive is a separate source with its own
 * address and is not affected by this one.
 */
export function createMusicbrainzClient(config: MusicbrainzConfig = {}) {
  const custom = config.serverUrl?.trim();
  const base = custom ? baseOf(custom) : PUBLIC_BASE;
  // Each client without an address builds its own limiter, so reach the public
  // server through `publicClient` below and never by calling this with no
  // config: MusicBrainz's limit is per client application, and two of them
  // spacing separately would together send twice the allowed rate.
  // `currentMusicbrainzClient` only calls this when an address is set, which
  // is what keeps there being exactly one.
  const spaced: <T>(run: () => Promise<T>) => Promise<T> = custom
    ? run => run()
    : createRateLimiter(MUSICBRAINZ_MIN_INTERVAL_MS);

  const fallbacks = custom ? (config.fallbackUrls ?? []).map(url => url.trim()).filter(Boolean) : [];

  async function get<T>(root: string, path: string, timeoutMs?: number): Promise<T> {
    const init = timeoutMs ? { headers: HEADERS, timeoutMs } : { headers: HEADERS };
    const res = await fetchWithTimeout(`${root}${path}`, init);
    if (!res.ok) throw new Error(`MusicBrainz ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  async function mb<T>(path: string): Promise<T> {
    return spaced(async () => {
      if (!custom || fallbacks.length === 0) return get<T>(base, path);

      // More than one address: try them in order, the one that answered last
      // first. Only a request that never reached a server moves on to the
      // next address; an error status from a server that answered does not.
      const server = { id: FAILOVER_ID, serverUrl: custom, fallbackUrls: fallbacks };
      const order = orderedUrls(server);
      const lastUrl = order[order.length - 1];
      return tryWithFailover<T>(server, async url => {
        const patient = url === lastUrl;
        try {
          return await get<T>(baseOf(url), path, patient ? undefined : FAILOVER_ATTEMPT_TIMEOUT_MS);
        } catch (error) {
          // The fetch wrapper's own deadline is not one the failover
          // recognises as "this address did not answer".
          if ((error as { name?: string } | null)?.name === 'RequestTimeoutError') {
            throw new UrlTimeoutError(url, FAILOVER_ATTEMPT_TIMEOUT_MS);
          }
          throw error;
        }
      });
    });
  }

  async function searchArtist(name: string, limit = 5): Promise<MbArtist[]> {
    const q = encodeURIComponent(`artist:"${name}"`);
    const data = await mb<{ artists: MbArtist[] }>(`/artist?query=${q}&limit=${limit}&fmt=json`);
    return data.artists ?? [];
  }

  async function searchReleaseGroup(
    artist: string,
    title: string,
    limit = 5
  ): Promise<MbReleaseGroup[]> {
    const q = encodeURIComponent(`artist:"${artist}" releasegroup:"${title}"`);
    const data = await mb<{ 'release-groups': MbReleaseGroup[] }>(
      `/release-group?query=${q}&limit=${limit}&fmt=json`
    );
    return data['release-groups'] ?? [];
  }

  /**
   * Free-text release-group search, keyed on title alone rather than an
   * artist+title pair — this is what search's "Other sources" scope wants
   * (a user typing an album name with no artist context yet), whereas
   * {@link searchReleaseGroup} is for resolving a specific artist's album.
   */
  async function searchReleaseGroupByTitle(
    query: string,
    limit = 5
  ): Promise<MbReleaseGroup[]> {
    if (!query.trim()) return [];
    const q = encodeURIComponent(`releasegroup:"${query}"`);
    const data = await mb<{ 'release-groups': MbReleaseGroup[] }>(
      `/release-group?query=${q}&limit=${limit}&fmt=json`
    );
    return data['release-groups'] ?? [];
  }

  /**
   * Free-text search of recordings by title — the one MusicBrainz search
   * Yuzic never sent before: `searchReleaseGroupByTitle` only ever matched a
   * release-group's own title, so a song whose title differs from its album's
   * (nearly all of them) was unsearchable. Each hit already carries the
   * releases it appears on, which is what a caller needs to show and open the
   * album behind it — see `mapRecordingSearchHit`.
   */
  async function searchRecording(
    query: string,
    limit = 5
  ): Promise<MbRecordingHit[]> {
    if (!query.trim()) return [];
    const q = encodeURIComponent(`recording:"${query}"`);
    const data = await mb<{ recordings: MbRecordingHit[] }>(
      `/recording?query=${q}&limit=${limit}&fmt=json`
    );
    return data.recordings ?? [];
  }

  async function getArtistWithReleases(mbid: string): Promise<MbArtist> {
    return mb<MbArtist>(`/artist/${mbid}?inc=release-groups&fmt=json`);
  }

  async function getReleaseGroup(mbid: string): Promise<MbReleaseGroup> {
    return mb<MbReleaseGroup>(`/release-group/${mbid}?inc=artist-credits&fmt=json`);
  }

  async function getTracksForReleaseGroup(mbid: string): Promise<MbTrack[]> {
    const data = await mb<{ releases: MbRelease[] }>(
      `/release?release-group=${mbid}&inc=recordings+artist-credits&limit=1&fmt=json`
    );
    const release = data.releases?.[0];
    if (!release) return [];
    return release.media.flatMap(m => m.tracks ?? []);
  }

  return {
    searchArtist,
    searchReleaseGroup,
    searchReleaseGroupByTitle,
    searchRecording,
    getArtistWithReleases,
    getReleaseGroup,
    getTracksForReleaseGroup,
  };
}

export type MusicbrainzClient = ReturnType<typeof createMusicbrainzClient>;

/** The public server's client, shared so every call in the app is spaced on one line. */
const publicClient = createMusicbrainzClient();

export const {
  searchArtist,
  searchReleaseGroup,
  searchReleaseGroupByTitle,
  searchRecording,
  getArtistWithReleases,
  getReleaseGroup,
  getTracksForReleaseGroup,
} = publicClient;
