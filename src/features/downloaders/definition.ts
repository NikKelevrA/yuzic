/**
 * What a downloader is, and what a caller may ask of one.
 *
 * Split out of `registry.ts` because that file holds two different things: the
 * shape every downloader satisfies, and the list of the ones that do. Adding
 * the fourth downloader pushed it past the size the architecture gate allows,
 * and the contract is the half that nothing but the definitions reads.
 *
 * No implementation lives here, deliberately. A type in this file is a promise
 * about every downloader; a function would be a promise about one.
 */
import type { Href } from 'expo-router'

import type { Album } from '@/domain/entities/Album'
import type { AuthDescriptor, Health } from '@/providers/contracts/Provider'
import type { DownloaderId } from '@/state/redux/slices/downloadersSlice'
import type { ArtistMonitorRequest } from './artistMonitor'
import type { DownloaderQueueItem } from './queueItem'

export type DownloaderConfig = {
  serverUrl: string
  apiKey: string
  preferences?: Record<string, unknown>
}

export type DownloadResult =
  | { success: true }
  | { success: false; code?: string; message: string }

/**
 * Per-call knobs a downloader may honor for one Get, without changing any
 * saved default. Only Lidarr album downloads currently read
 * `qualityProfileId` — every other downloader ignores this bag entirely.
 */
export type DownloadOptions = {
  qualityProfileId?: number
}

/** One of a downloader's named quality settings, chosen by id per Get. */
export type QualityProfile = { id: number; name: string }

/**
 * The whole browsed album, not just its title and artist: Lidarr resolves the
 * release by MBID/Deezer id where available, and collapsing it to two strings
 * here would put it back on fuzzy name matching.
 */
export type AlbumDownloadRequest = Album
export type TrackDownloadRequest = { title: string; artist: string }
/**
 * An artist to follow, rather than a release to fetch. The MBID is what
 * actually identifies them where the catalogue supplied one; the name is the
 * fallback and the thing a lookup is spelled with.
 */
/**
 * What a downloader is and what it can do — the one place either is declared.
 *
 * Acquisition is not a broker capability. It was declared as one once, as a
 * thinner copy of the methods below that nothing called: it could carry no
 * per-call options (Lidarr's quality profile), no error codes, and no queue.
 * Every download flow — the Get sheet, the auto-downloader, batch requests —
 * calls these definitions directly.
 */
export type DownloaderDefinition = {
  label: string
  auth: AuthDescriptor
  testConnection(config: unknown): Promise<Health>
  // Narrows the id back to the closed downloader-id
  // union so every existing consumer keyed on `DownloaderId` still compiles.
  id: DownloaderId
  descriptionKey: string
  albumAddedKey: string
  trackAddedKey?: string
  /** Confirms an artist is now followed. Present exactly when `monitorArtist` is. */
  artistMonitoredKey?: string
  settingsRoute: Href
  /**
   * Both units are optional, because a downloader gets to have a natural one.
   * Lidarr is album-oriented and can't fetch a single file; SoulSync's request
   * pipeline is track-oriented and has no album endpoint at all; slskd does
   * both. Callers presence-check the unit they need rather than assuming an
   * album is always on offer — `downloadAlbum` used to be required, which was
   * Lidarr's shape written into the contract for everyone.
   */
  downloadAlbum?(config: DownloaderConfig, req: AlbumDownloadRequest, options?: DownloadOptions): Promise<DownloadResult>
  downloadTrack?(config: DownloaderConfig, req: TrackDownloadRequest): Promise<DownloadResult>
  /**
   * Follow an artist, so what they release from now on is picked up.
   *
   * A third unit alongside the two above, and optional for the same reason:
   * only a collection manager has any concept of an artist it watches. A
   * transfer tool fetches a named file and has nothing to be told about a
   * person, which is why an artist want with none of these connected stays a
   * bookmark rather than showing a Get that would do nothing.
   */
  monitorArtist?(config: DownloaderConfig, req: ArtistMonitorRequest): Promise<DownloadResult>
  /**
   * The quality profiles an album Get can pick from, passed back as
   * `options.qualityProfileId`. Absent where a downloader has no such setting,
   * which is how the Get sheet knows not to offer one.
   */
  getQualityProfiles?(config: DownloaderConfig): Promise<QualityProfile[]>
  /**
   * Read the transfer queue, in the one shape every surface understands.
   *
   * Normalising here rather than at each reader is the point. This used to
   * returned the downloader's own records, typed
   * `T extends { id: string }` and reached through two `as any` casts — so
   * everything downstream either knew all three record shapes or knew none of
   * them, and the surfaces that needed detail chose the former.
   *
   * Diffing moved out with the types: comparing two reads by id needs nothing
   * downloader-specific, and it was being done three times, once per record
   * shape. See `finishedSince`.
   *
   * Downloader-operational, not a product capability: it is how a downloader
   * reports progress on units it already fills, not a unit of its own — nobody
   * asks "who can poll a queue".
   */
  fetchQueue(config: DownloaderConfig): Promise<DownloaderQueueItem[]>
  /**
   * Stop a queued transfer. Absent where the downloader offers no way to.
   *
   * Takes the normalised item rather than the downloader's own record, and
   * reads `transferIds` and `peer` back out of it — which is all any of the
   * three needed. Before this, cancelling was wired up at the screen, inside a
   * three-way `if (id === ...)` that also chose the fetch and the row renderer;
   * a fourth downloader meant a fourth branch in a file about layout.
   */
  cancelQueueItem?(config: DownloaderConfig, item: DownloaderQueueItem): Promise<void>
}
