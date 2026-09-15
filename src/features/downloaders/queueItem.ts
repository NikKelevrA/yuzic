import { normalizeName } from '@/domain/identity/matching';

/**
 * One item in a downloader's transfer queue, in terms every surface can read.
 *
 * The three downloaders describe a transfer three different ways — Lidarr
 * reports an album and an artist it resolved, slskd reports the remote
 * directory a file came from, SoulSync reports a track — and each surface that
 * wanted to know "is this album downloading" used to reach into whichever
 * shapes it knew about and branch on the provider by name. So the album row,
 * the settings card and the home banner each had their own idea of what a
 * queue is, and adding a fourth downloader meant editing all of them.
 *
 * Each downloader normalises its own records into this, with its own concrete
 * types and no casts. What reads a queue afterwards reads one shape.
 */
export interface DownloaderQueueItem {
  /** Stable within one downloader; not unique across downloaders. */
  id: string;
  /** 0–100. */
  percentComplete: number;
  /** What the transfer is for, as the downloader names it. */
  title: string;
  /** Empty when the downloader could not tell — slskd frequently cannot. */
  artistName: string;
  /**
   * False once a transfer has finished but has not yet left the queue.
   *
   * A finished item is not the same as a disappeared one: only the second
   * means the file has landed somewhere the server can scan, which is why the
   * completion signal is a disappearance rather than this flag.
   */
  active: boolean;
  /**
   * How well `title` identifies an album.
   *
   * `exact` — the downloader resolved a real album and reports its name;
   * matching it against a browsed album can be strict.
   * `loose` — the title came from a remote directory or a file name, so it
   * needs the fuzzy comparison below. There is no album identity to be had
   * from Soulseek; what there is, is a folder someone named.
   */
  identity: 'exact' | 'loose';

  // Everything below is optional because it is genuinely optional: each
  // downloader knows some of it and not the rest, and a field named for what
  // it *is* can be absent honestly. Named for the fact rather than for who
  // reports it, so the row that draws them needs no list of downloaders.

  /** Tracks in this import, when the downloader counts an album's tracks. */
  trackCount?: number;
  /** Files in this transfer, when the downloader counts files instead. */
  fileCount?: number;
  /** Total size, when known. */
  sizeBytes?: number;
  /** Current rate, while the transfer is actually moving. */
  speedBytesPerSec?: number;
  /** Who is serving the files. Shown in place of an artist when none is known. */
  peer?: string;
  /** The album a track belongs to, when the unit being fetched is a track. */
  albumTitle?: string;
  /** Problems the downloader reported — shown when a row is opened. */
  warnings?: string[];
  /**
   * What it takes to address the underlying transfers, for cancellation.
   *
   * One row is often several transfers: Lidarr groups an album's tracks and
   * slskd groups a remote directory's files, so cancelling a row means
   * cancelling all of them. Opaque to everything except the downloader that
   * produced them.
   */
  transferIds: string[];
}

export interface AlbumIdentity {
  title: string;
  artist: string;
}

/**
 * Below this many characters a containment test stops meaning anything: a
 * queue entry from a folder called "EP" would otherwise match Sleep, Deep and
 * Repeat alike. Short titles are real ("X", "÷", "1989"), so they are compared
 * exactly rather than excluded.
 */
const MIN_LENGTH_FOR_CONTAINMENT = 4;

function looselyEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < MIN_LENGTH_FOR_CONTAINMENT || right.length < MIN_LENGTH_FOR_CONTAINMENT) {
    return false;
  }
  return left.includes(right) || right.includes(left);
}

/**
 * Whether a queued transfer is the album being looked at.
 *
 * The strictness comes from the item rather than from the caller, which is
 * what lets an album row ask this question without knowing which downloaders
 * exist. A Lidarr row has to match exactly — it knows what album it resolved,
 * and accepting a near miss would show the wrong album as downloading. A
 * Soulseek row cannot be matched exactly by anything, because a remote folder
 * name is all there is.
 */
export function matchesAlbum(item: DownloaderQueueItem, album: AlbumIdentity): boolean {
  const itemTitle = normalizeName(item.title);
  const albumTitle = normalizeName(album.title);
  const itemArtist = normalizeName(item.artistName);
  const albumArtist = normalizeName(album.artist);

  if (item.identity === 'exact') {
    return itemTitle === albumTitle && itemArtist === albumArtist;
  }

  if (!looselyEqual(itemTitle, albumTitle)) return false;
  // The artist is only known when the remote path revealed one. When it did,
  // it has to agree — two artists' "Greatest Hits" are not the same download.
  if (!itemArtist) return true;
  return looselyEqual(itemArtist, albumArtist);
}

/**
 * Which items have left the queue since the previous read.
 *
 * Disappearance is the completion signal, and it is the only one available:
 * a downloader that finishes a transfer writes into the media library the way
 * a manual copy would, and the media server has no idea until it scans. So the
 * app watches for items it used to see and no longer does, and asks the server
 * to look.
 *
 * By id, and generically, because that is all it takes — the previous version
 * of this lived inside each downloader's own API module, where it needed that
 * downloader's record type and was reached through two `as any` casts to get
 * past the difference.
 */
export function finishedSince(
  previous: DownloaderQueueItem[],
  current: DownloaderQueueItem[]
): DownloaderQueueItem[] {
  if (previous.length === 0) return [];
  const stillQueued = new Set(current.map(item => item.id));
  return previous.filter(item => !stillQueued.has(item.id));
}
