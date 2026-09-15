import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import { createRateLimiter } from '@/providers/http/rateLimit';

const BASE = 'https://musicbrainz.org/ws/2';
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
const limit = createRateLimiter(MUSICBRAINZ_MIN_INTERVAL_MS);

async function mb<T>(path: string): Promise<T> {
  return limit(async () => {
    const res = await fetchWithTimeout(`${BASE}${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`MusicBrainz ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  });
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

type MbRelease = {
  id: string;
  title: string;
  media: { tracks: MbTrack[] }[];
};

export async function searchArtist(name: string, limit = 5): Promise<MbArtist[]> {
  const q = encodeURIComponent(`artist:"${name}"`);
  const data = await mb<{ artists: MbArtist[] }>(`/artist?query=${q}&limit=${limit}&fmt=json`);
  return data.artists ?? [];
}

export async function searchReleaseGroup(
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
export async function searchReleaseGroupByTitle(
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

export async function getArtistWithReleases(mbid: string): Promise<MbArtist> {
  return mb<MbArtist>(`/artist/${mbid}?inc=release-groups&fmt=json`);
}

export async function getReleaseGroup(mbid: string): Promise<MbReleaseGroup> {
  return mb<MbReleaseGroup>(`/release-group/${mbid}?inc=artist-credits&fmt=json`);
}

export async function getTracksForReleaseGroup(mbid: string): Promise<MbTrack[]> {
  const data = await mb<{ releases: MbRelease[] }>(
    `/release?release-group=${mbid}&inc=recordings+artist-credits&limit=1&fmt=json`
  );
  const release = data.releases?.[0];
  if (!release) return [];
  return release.media.flatMap(m => m.tracks ?? []);
}
