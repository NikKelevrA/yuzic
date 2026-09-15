import * as FileSystem from 'expo-file-system/legacy';
import type { Song } from '@/domain/entities/Song';
import { STAGING_SUFFIX, sanitizeFileName } from '@/features/offline/restore';

/**
 * Where a saved track lives, and how it gets there.
 *
 * Pulled out of the download provider because none of it is about React: these
 * are the rules for one directory — what a partial file is called, when the
 * directory has to exist, and which strays are safe to delete. They sat among
 * forty hooks, which is how the sweep below ended up being called two ways.
 */

export const DOWNLOAD_DIR = `${FileSystem.documentDirectory ?? ''}downloads/audio/`;

/**
 * A background session needs `com.apple.nsurlsessiond`, reached over XPC. When
 * that connection cannot be set up the session fails every task it is given —
 * the app sees `NSURLErrorDomain Code=-1 "unknown error"` on each one, with the
 * real cause (`NSCocoaErrorDomain Code=4097 "connection to service named
 * com.apple.nsurlsessiond"`) only in the system log. The iOS Simulator has no
 * nsurlsessiond at all, so every download there fails this way; on device the
 * daemon can also be briefly unreachable.
 */
export const BACKGROUND_FILE_OPTIONS = {
  sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
};

/** No such dependency, which is why it is what a failed background try retries on. */
export const FOREGROUND_FILE_OPTIONS = {
  sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
};

/**
 * Where a track's bytes accumulate before it is a download.
 *
 * Named by identity, not by the origin's id: two servers can both call a track
 * `42`, and a staging file named after that would have one download overwrite
 * the other mid-flight.
 */
export function buildStagingPath(track: Song): string {
  return `${DOWNLOAD_DIR}${sanitizeFileName(track.localId)}${STAGING_SUFFIX}`;
}

export async function ensureDownloadDir(): Promise<void> {
  if (!FileSystem.documentDirectory) throw new Error('Document directory unavailable');
  const downloadInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!downloadInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

/**
 * Delete stray partials, except the ones being held to resume from.
 *
 * Downloads land in a `.part` staging file and only move to their final path
 * on success, so a stray `.part` is ordinarily safe to delete.
 *
 * `keep` has no default, deliberately. It used to default to the empty set,
 * which made "sweep everything" the thing a caller got by not thinking about
 * it — and one of the two call sites did exactly that, on every launch,
 * deleting the partials the resumables pointed at. Every caller states what it
 * is keeping now, or it does not compile.
 */
export async function cleanupStagingFiles(keep: Set<string>): Promise<void> {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!info.exists) return;
  const names = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter(name => name.endsWith(STAGING_SUFFIX))
      .map(name => `${DOWNLOAD_DIR}${name}`)
      .filter(path => !keep.has(path))
      .map(path => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {}))
  );
}

/**
 * Remove downloaded files. Best-effort per file: one that will not delete is
 * wasted space, and failing the whole removal over it would leave the listener
 * with a library entry they asked to be rid of.
 */
export async function deleteDownloadedFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(path => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {}))
  );
}
