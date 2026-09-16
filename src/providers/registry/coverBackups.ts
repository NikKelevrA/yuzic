/**
 * The outside sources that can supply a picture an item's own source did not
 * have, declared here with the other provider declarations so the cover
 * resolution in `features/artwork` asks for "a backup" and never names one.
 *
 * Which of these run, and in what order, is the user's Metadata › Artwork
 * list (`sources.ts`, purpose `artwork`): Cover Art Archive first, because it
 * matches an album by MusicBrainz id, then Deezer, which matches by name.
 */
import * as deezer from '@/providers/integration/deezer';
import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import type { CoverSource, CoverSubject } from '@/domain/entities/Cover';
import { leadArtistName, normalizeName } from '@/domain/identity/matching';
import type { SourceId } from './sources';

interface CoverBackup {
  source: SourceId;
  /** Whether this source can answer for this kind of subject at all. */
  handles(subject: CoverSubject): boolean;
  /**
   * The picture this source has for the subject, or `null` when it has none —
   * a definite answer, remembered as one. Throws when the source could not be
   * asked, which is not an answer and is not remembered.
   */
  lookup(subject: CoverSubject): Promise<CoverSource | null>;
}

const COVER_ART_ARCHIVE = 'https://coverartarchive.org';

/** One of the directory's mirrors; they all serve the same data. */
const RADIO_BROWSER = 'https://de1.api.radio-browser.info';
const RADIO_BROWSER_AGENT = 'yuzic';

/** As much of a Radio Browser station as a logo lookup reads. */
type RadioBrowserStation = { name?: string; favicon?: string };

/**
 * Cover Art Archive by MusicBrainz id: an exact match, never a guess.
 *
 * Servers do not always say whether an album id is a release or a release
 * group, and one said the wrong one before, so the stated kind is asked first
 * and the other second. The listing is asked rather than the image, so an
 * album the archive has no front for is a definite "none" instead of a
 * broken image.
 */
const coverArtArchive: CoverBackup = {
  source: 'coverartarchive',
  handles: subject => subject.kind === 'album' && Boolean(subject.mbid),
  async lookup(subject) {
    if (subject.kind !== 'album' || !subject.mbid) return null;
    const kinds = subject.mbidType === 'release'
      ? (['release', 'release-group'] as const)
      : (['release-group', 'release'] as const);

    for (const mbidType of kinds) {
      const res = await fetchWithTimeout(`${COVER_ART_ARCHIVE}/${mbidType}/${encodeURIComponent(subject.mbid)}`, {
        headers: { Accept: 'application/json' },
      });
      // 404: nothing under this id. 400: not a valid id of this kind.
      if (res.status === 404 || res.status === 400) continue;
      if (!res.ok) throw new Error(`Cover Art Archive error (${res.status})`);
      const listing = (await res.json()) as { images?: { front?: boolean }[] };
      if (listing.images?.some(image => image.front)) {
        return { kind: 'coverartarchive', mbid: subject.mbid, mbidType };
      }
    }
    return null;
  },
};

/** Two credits name the same lead artist. */
const sameLeadArtist = (a: string, b: string) =>
  normalizeName(leadArtistName(a)) === normalizeName(leadArtistName(b));

/**
 * Deezer by name. A name search always finds somebody, so the result is used
 * only when it is the same name — a placeholder is better than a stranger's
 * photo. Names are compared by lead artist, whichever service credited a
 * featured one: "A feat. B" and Deezer's "A" are the same album's artist.
 */
const deezerCatalogue: CoverBackup = {
  source: 'deezer',
  // Everything it has a catalogue for, which is music — a music service knows
  // nothing about radio stations.
  handles: subject => subject.kind !== 'station',
  async lookup(subject) {
    if (subject.kind === 'artist') {
      const name = leadArtistName(subject.name);
      const match = await deezer.resolveDeezerArtistByName(name);
      if (!match || !sameLeadArtist(match.name, name)) return null;
      return match.cover.kind === 'none' ? null : match.cover;
    }
    if (subject.kind !== 'album') return null;
    const artistName = leadArtistName(subject.artistName);
    const match = await deezer.resolveDeezerAlbum(artistName, subject.title);
    if (!match) return null;
    const sameAlbum =
      normalizeName(match.title) === normalizeName(subject.title) &&
      sameLeadArtist(match.artist.name, artistName);
    return sameAlbum && match.cover.kind !== 'none' ? match.cover : null;
  },
};

/**
 * Radio Browser, the community station directory, for station logos.
 *
 * The only backup that answers for a station, and the only subject it
 * answers for — a directory of streams knows nothing about albums.
 *
 * Matched by stream URL first, which is exact, then by name, which is not:
 * a name search always returns somebody, so the result is kept only when the
 * name really matches, the same rule the catalogue backup follows. Plenty of
 * stations are listed with `favicon: ""` — an empty string is "no logo", not
 * a URL, and saying so is what lets the radio mark be drawn instead.
 */
const radioBrowser: CoverBackup = {
  source: 'radiobrowser',
  handles: subject => subject.kind === 'station',
  async lookup(subject) {
    if (subject.kind !== 'station') return null;

    const ask = async (path: string): Promise<RadioBrowserStation[]> => {
      const res = await fetchWithTimeout(`${RADIO_BROWSER}/json/stations/${path}`, {
        // The directory asks callers to identify themselves rather than
        // arriving anonymously.
        headers: { Accept: 'application/json', 'User-Agent': RADIO_BROWSER_AGENT },
      });
      if (!res.ok) throw new Error(`Radio Browser error (${res.status})`);
      const body = (await res.json()) as unknown;
      return Array.isArray(body) ? (body as RadioBrowserStation[]) : [];
    };

    const logoOf = (station: RadioBrowserStation | undefined): CoverSource | null => {
      const favicon = station?.favicon?.trim();
      return favicon ? { kind: 'url', url: favicon } : null;
    };

    if (subject.streamUrl) {
      const [exact] = await ask(`byurl?url=${encodeURIComponent(subject.streamUrl)}`);
      const logo = logoOf(exact);
      if (logo) return logo;
    }

    const byName = await ask(`search?limit=5&name=${encodeURIComponent(subject.name)}`);
    const named = byName.find(
      station => station.name && normalizeName(station.name) === normalizeName(subject.name)
    );
    return logoOf(named);
  },
};

const BACKUPS: Partial<Record<SourceId, CoverBackup>> = {
  coverartarchive: coverArtArchive,
  deezer: deezerCatalogue,
  radiobrowser: radioBrowser,
};

/** The backup an artwork source provides, or null for a source that is not one. */
export function coverBackupFor(source: SourceId): CoverBackup | null {
  return BACKUPS[source] ?? null;
}
