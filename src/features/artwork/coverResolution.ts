/**
 * One rule for every picture of an artist or album, wherever it is drawn.
 *
 *  1. The item's own source — the server for a library item, Deezer for a
 *     Deezer item, Cover Art Archive for a MusicBrainz album. Mappers put that
 *     on the cover; a cover that has one is returned untouched.
 *  2. The library's copy of the same item, matched by MusicBrainz id and then
 *     by name. An artist you own shows your server's photo, whoever named it.
 *  3. The backups switched on in Settings › Metadata › Artwork, in their order.
 *  4. Nothing: the gap is returned and the placeholder is drawn.
 *
 * A server gap, a similar-artist tile and an outside artist page all go
 * through these same steps; nothing here knows which screen is asking.
 *
 * Steps 1, 2 and remembered answers from step 3 are synchronous, so
 * `buildCover` can apply them for surfaces that only want a URL (the player,
 * CarPlay). Asking a backup is asynchronous and is started by whatever draws
 * the cover (`useResolvedCover`); subscribers hear when an answer lands.
 *
 * What a backup found is remembered per source and subject — not written onto
 * the entity. Turning a source off stops its answers being read, which
 * restores the placeholder at once, and turning it back on reads them again
 * without asking twice.
 */
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import { coverSubjectKey, type CoverSource, type CoverSubject } from '@/domain/entities/Cover';
import { matchAlbumToLibrary, matchArtistToLibrary } from '@/features/library/matchToLibrary';
import { coverBackupFor } from '@/providers/registry/coverBackups';
import type { SourceId } from '@/providers/registry/sources';
import { mmkv } from '@/state/mmkvStorage';

/** Where a resolved picture came from: the item's own source, the library's copy, or a backup. */
type CoverOrigin = 'own' | 'library' | SourceId;

export interface ResolvedCover {
  cover: CoverSource;
  from: CoverOrigin;
}

interface ResolutionContext {
  /** The active library, for step 2. */
  artists: readonly Artist[];
  albums: readonly Album[];
  /** Enabled artwork backups, in the order they are tried. */
  backups: readonly SourceId[];
  /** Backups are not asked offline, where they could only fail. */
  online: boolean;
}

type Remembered = { cover: CoverSource | null; at: number };

/**
 * v2: backups match by lead artist. A v1 miss may be a featured credit the old
 * exact-name match turned away, and would stand for a week — so v1 is dropped.
 */
const STORAGE_PREFIX = 'cover-backup:v2:';
const RETIRED_STORAGE_PREFIXES = ['cover-backup:v1:'];
/** A source that had nothing is asked again after a week — archives grow. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A picture is re-checked monthly, in case it was replaced or taken down. */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A source that could not be reached is left alone this long before retrying. */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

let context: ResolutionContext = { artists: [], albums: [], backups: [], online: false };
const listeners = new Set<() => void>();
const remembered = new Map<string, Remembered | null>();
const libraryCopies = new Map<string, CoverSource | null>();
const failures = new Map<string, number>();
const inFlight = new Set<string>();

const notify = () => listeners.forEach(listener => listener());

export function subscribeCoverResolution(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * What the resolution currently depends on, as one comparable value — a
 * drawing surface re-asks when it changes (a backup switched on, back online).
 */
export function coverResolutionContextKey(): string {
  return `${context.online ? 'online' : 'offline'}|${context.backups.join(',')}`;
}

export function setCoverResolutionContext(next: Partial<ResolutionContext>): void {
  const merged = { ...context, ...next };
  const libraryChanged = merged.artists !== context.artists || merged.albums !== context.albums;
  const changed =
    libraryChanged ||
    merged.online !== context.online ||
    merged.backups.join(',') !== context.backups.join(',');
  if (!changed) return;
  if (libraryChanged) libraryCopies.clear();
  context = merged;
  notify();
}

const storageKey = (source: SourceId, subjectKey: string) => `${STORAGE_PREFIX}${source}:${subjectKey}`;

let retiredAnswersDropped = false;

/** Removes answers kept under an earlier matching rule, once per launch. */
function dropRetiredAnswers(): void {
  if (retiredAnswersDropped) return;
  retiredAnswersDropped = true;
  for (const key of mmkv.getAllKeys()) {
    if (RETIRED_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) mmkv.remove(key);
  }
}

function readRemembered(source: SourceId, subjectKey: string): Remembered | null {
  dropRetiredAnswers();
  const key = storageKey(source, subjectKey);
  let entry = remembered.get(key);
  if (entry === undefined) {
    const raw = mmkv.getString(key);
    try {
      entry = raw ? (JSON.parse(raw) as Remembered) : null;
    } catch {
      entry = null;
    }
    remembered.set(key, entry);
  }
  return entry;
}

function isFresh(entry: Remembered, now: number): boolean {
  return now - entry.at < (entry.cover ? HIT_TTL_MS : MISS_TTL_MS);
}

function remember(source: SourceId, subjectKey: string, cover: CoverSource | null): void {
  const key = storageKey(source, subjectKey);
  const entry: Remembered = { cover, at: Date.now() };
  remembered.set(key, entry);
  mmkv.set(key, JSON.stringify(entry));
}

function libraryCopy(subject: CoverSubject, subjectKey: string): CoverSource | null {
  const known = libraryCopies.get(subjectKey);
  if (known !== undefined) return known;

  let copy: CoverSource | null = null;
  if (subject.kind === 'artist') {
    const match = matchArtistToLibrary(
      { name: subject.name, externalIds: subject.mbid ? { mbid: subject.mbid } : {} },
      context.artists
    );
    if (match && match.cover.kind !== 'none') copy = match.cover;
  } else {
    const match = matchAlbumToLibrary(
      {
        title: subject.title,
        artistName: subject.artistName,
        externalIds: subject.mbid ? { mbid: subject.mbid, mbidType: subject.mbidType } : {},
      },
      context.albums
    );
    if (match && match.cover.kind !== 'none') copy = match.cover;
  }
  libraryCopies.set(subjectKey, copy);
  return copy;
}

/**
 * The best picture known right now, without asking anyone.
 *
 * A remembered answer from an enabled backup is used even offline — it was
 * found while online, and the image itself may well be in the disk cache.
 */
export function resolveCoverNow(cover: CoverSource): ResolvedCover {
  if (cover.kind !== 'none' || !cover.subject) return { cover, from: 'own' };
  const subjectKey = coverSubjectKey(cover.subject);

  const copy = libraryCopy(cover.subject, subjectKey);
  if (copy) return { cover: copy, from: 'library' };

  for (const source of context.backups) {
    const entry = readRemembered(source, subjectKey);
    if (entry?.cover) return { cover: entry.cover, from: source };
  }
  return { cover, from: 'own' };
}

/**
 * Asks the enabled backups, in order, for a picture of this cover's subject,
 * stopping at the first that has one. Sources already answered are not asked
 * again until their answer is stale; one that could not be reached is left
 * alone for a few minutes. Does nothing for a cover that needs no backup.
 */
export function requestCoverBackup(cover: CoverSource): void {
  if (cover.kind !== 'none' || !cover.subject || !context.online) return;
  const subject = cover.subject;
  const subjectKey = coverSubjectKey(subject);
  if (libraryCopy(subject, subjectKey) || inFlight.has(subjectKey)) return;

  const now = Date.now();
  const toAsk: SourceId[] = [];
  for (const source of context.backups) {
    const backup = coverBackupFor(source);
    if (!backup?.handles(subject)) continue;
    const entry = readRemembered(source, subjectKey);
    if (entry && isFresh(entry, now)) {
      if (entry.cover) break;
      continue;
    }
    const failedAt = failures.get(storageKey(source, subjectKey));
    if (failedAt !== undefined && now - failedAt < FAILURE_BACKOFF_MS) continue;
    toAsk.push(source);
  }
  if (toAsk.length === 0) return;

  inFlight.add(subjectKey);
  void (async () => {
    try {
      for (const source of toAsk) {
        const backup = coverBackupFor(source);
        if (!backup) continue;
        try {
          const found = await backup.lookup(subject);
          failures.delete(storageKey(source, subjectKey));
          remember(source, subjectKey, found);
          if (found) {
            notify();
            return;
          }
        } catch {
          failures.set(storageKey(source, subjectKey), Date.now());
        }
      }
    } finally {
      inFlight.delete(subjectKey);
    }
  })();
}
