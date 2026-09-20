/**
 * Every outside source Yuzic may ask about your music, and what each can
 * provide.
 *
 * Settings are organised by what the data is for — artwork, lyrics, similar
 * artists — not by company. A source declares its uses here once, and every
 * list for those purposes picks it up, so a new source needs no screen of its
 * own. One company is several uses: Deezer fills artwork, previews, Home
 * shelves and search, each with its own switch, where it used to be a single
 * "discovery" switch that turned on things nobody had asked about.
 *
 * Declared here, with the other provider declarations, so settings and feature
 * code can refer to a use without naming the company behind it.
 */

export type SourceId = 'deezer' | 'listenbrainz' | 'lastfm' | 'musicbrainz' | 'coverartarchive' | 'lrclib' | 'radiobrowser';

/** What the data is for. Each purpose is one list on one settings screen. */
export type SourcePurpose =
  | 'artistInfo'
  | 'artwork'
  | 'lyrics'
  | 'similarArtists'
  | 'popularTracks'
  | 'previews'
  | 'recommendations'
  | 'homeShelves'
  | 'search';

export type SourceUseId = `${SourceId}.${SourcePurpose}`;

/** Server addresses the user has set for sources they run themselves, by source. */
export type SourceServerUrls = Partial<Record<SourceId, string>>;

/**
 * Sources that can be pointed at a server of your own instead of the public
 * one. The address is asked for on the source's own sheet, so the screen only
 * needs to know that a source can take one, not which source it is.
 */
const SELF_HOSTABLE: readonly SourceId[] = ['musicbrainz'];

export const isSelfHostable = (source: SourceId): boolean => SELF_HOSTABLE.includes(source);

/**
 * The address a person typed for a server of their own, tidied, or null when
 * it is not a web address at all.
 *
 * Only the shape is checked here: `http` or `https`, a host, an optional port
 * and an optional path, no spaces. Whether anything answers there is asked
 * separately, because that needs the network.
 */
export function parseServerAddress(input: string): string | null {
  const address = input.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(address) ? address : null;
}

type SourceDeclaration = {
  id: SourceId;
  nameKey: string;
  /** Everything this source can be sent, in one line — shown when asking to allow it. */
  sendsKey: string;
};

type SourceUse = {
  id: SourceUseId;
  source: SourceId;
  purpose: SourcePurpose;
  /** What this use adds, beside the source's name in a list. */
  subtextKey: string;
};

const declare = (id: SourceId): SourceDeclaration => ({
  id,
  nameKey: `settings.sources.${id}.name`,
  sendsKey: `settings.sources.${id}.sends`,
});

export const SOURCES: Record<SourceId, SourceDeclaration> = {
  deezer: declare('deezer'),
  listenbrainz: declare('listenbrainz'),
  lastfm: declare('lastfm'),
  musicbrainz: declare('musicbrainz'),
  coverartarchive: declare('coverartarchive'),
  lrclib: declare('lrclib'),
  radiobrowser: declare('radiobrowser'),
};

// Not `use`: that name is React's hook, and the hooks lint rule treats a call
// to anything named `use` as one.
const sourceUse = (source: SourceId, purpose: SourcePurpose): SourceUse => ({
  id: `${source}.${purpose}`,
  source,
  purpose,
  subtextKey: `settings.sourceUses.${source}.${purpose}`,
});

/**
 * Every use, in a fixed order within each purpose: your server is always
 * tried first, then these, top to bottom.
 *
 * The order is ours rather than the user's. No purpose has two sources
 * competing for the same field except album covers, and there the answer is
 * not a matter of taste: Cover Art Archive matches the exact release by
 * MusicBrainz id, Deezer matches by name, so the exact match goes first.
 *
 * Artwork uses are backups for any picture an item's own source lacks —
 * a server gap and a similar-artist tile alike — applied by
 * `features/artwork/coverResolution` after the library's own copy.
 */
export const SOURCE_USES: readonly SourceUse[] = [
  sourceUse('lastfm', 'artistInfo'),
  sourceUse('coverartarchive', 'artwork'),
  sourceUse('deezer', 'artwork'),
  // Only answers for radio stations, which neither of the two above can — so
  // its place in the order never costs an album or artist lookup anything.
  sourceUse('radiobrowser', 'artwork'),
  sourceUse('lrclib', 'lyrics'),
  // Similar artists are shown as one row per source, never merged, so this
  // order is only the order of the rows.
  sourceUse('listenbrainz', 'similarArtists'),
  sourceUse('lastfm', 'similarArtists'),
  sourceUse('deezer', 'similarArtists'),
  sourceUse('deezer', 'popularTracks'),
  sourceUse('deezer', 'previews'),
  // A playlist's recommendations need both: Last.fm finds similar artists,
  // Deezer turns them into tracks. An album's need only Deezer.
  sourceUse('lastfm', 'recommendations'),
  sourceUse('deezer', 'recommendations'),
  sourceUse('listenbrainz', 'homeShelves'),
  sourceUse('deezer', 'homeShelves'),
  sourceUse('deezer', 'search'),
  sourceUse('musicbrainz', 'search'),
];

/** The uses for one purpose, in the order they are tried. */
export const usesFor = (purpose: SourcePurpose): SourceUse[] =>
  SOURCE_USES.filter(entry => entry.purpose === purpose);

/** Everything one source is used for. */
export const usesOf = (source: SourceId): SourceUse[] =>
  SOURCE_USES.filter(entry => entry.source === source);

/** A source's search use, for code that holds a source id rather than a use. */
export const searchUseOf = (source: SourceId): SourceUseId => `${source}.search`;

/** The purposes on each settings screen, in screen order. */
export const SOURCE_SCREENS: Readonly<Record<'metadata' | 'pages' | 'search', readonly SourcePurpose[]>> = {
  metadata: ['artistInfo', 'artwork', 'lyrics'],
  pages: ['similarArtists', 'popularTracks', 'previews', 'recommendations'],
  search: ['search'],
};

/**
 * The switches that onboarding's "turn on discovery" turns on: everything
 * that shows music from outside your library, but not what fills in your own
 * library's metadata or where search looks.
 */
export const DISCOVERY_USES: readonly SourceUseId[] = [
  'listenbrainz.homeShelves',
  'listenbrainz.similarArtists',
  'deezer.homeShelves',
  'deezer.similarArtists',
  'deezer.popularTracks',
  'deezer.previews',
  'deezer.recommendations',
];
