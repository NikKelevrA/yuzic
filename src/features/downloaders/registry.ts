import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import * as lidarr from '@/providers/integration/lidarr'
import * as slskd from '@/providers/integration/slskd'
import * as soulsync from '@/providers/integration/soulsync'
import * as downtify from '@/providers/integration/downtify'
import type { SlskdSearchPreferences } from '@/providers/integration/slskd'
import type { DownloaderId } from '@/state/redux/slices/downloadersSlice'
import type { ArtistMonitorRequest } from './artistMonitor'
import type { LidarrConfig } from '@/providers/integration/lidarr/config'
import { selectDownloadersForActiveServer, downloaderCredentialScope } from '@/state/redux/selectors/downloadersSelectors'
import { selectActiveServerId, selectCredentialsHydrated } from '@/state/redux/selectors/serversSelectors'
import { getCredentials } from '@/state/credentialCache'
import type { Health } from '@/providers/contracts/Provider'
import type {
  AlbumDownloadRequest,
  DownloadOptions,
  DownloadResult,
  DownloaderConfig,
  DownloaderDefinition,
  TrackDownloadRequest,
} from './definition'

export { downloadErrorKey } from './errorKeys'

export type { DownloaderId }
export type { QualityProfile } from './definition'

/** Lidarr, slskd and SoulSync authenticate the same way: a server URL plus an API key. */
const apiKeyAuth = { tier: 'apiKey' as const, configKeys: ['serverUrl', 'apiKey'] }

/**
 * Downtify's API has no authentication at all — no key, no token, no basic
 * auth. It is the first downloader here with nothing to hold, which is why
 * `configKeys` is absent: there is no credential to name.
 *
 * `isAuthenticated` on its connection therefore means "answered when asked"
 * rather than "the key was accepted". That is the honest reading for a service
 * that cannot refuse anyone, and it is what the settings screen tells the user.
 */
const noAuth = { tier: 'none' as const }

function lidarrConfigOf(config: DownloaderConfig): LidarrConfig {
  return { serverUrl: config.serverUrl, apiKey: config.apiKey }
}

const lidarrDownloadAlbum = (
  config: DownloaderConfig,
  album: AlbumDownloadRequest,
  options?: DownloadOptions
) =>
  lidarr.downloadAlbum(config, lidarr.albumRequestFromExternal(album), {
    qualityProfileId: options?.qualityProfileId,
  })

const lidarrMonitorArtist = async (
  config: DownloaderConfig,
  req: ArtistMonitorRequest
): Promise<DownloadResult> => {
  const result = await lidarr.monitorArtist(lidarrConfigOf(config), req)
  return result.success ? { success: true } : { success: false, code: result.code, message: result.message }
}

const lidarrDownloader: DownloaderDefinition = {
  id: 'lidarr',
  label: 'Lidarr',
  descriptionKey: 'externalAlbum.download.lidarrDesc',
  albumAddedKey: 'externalAlbum.download.addedToLidarr',
  artistMonitoredKey: 'externalAlbum.download.monitoringOnLidarr',
  settingsRoute: '/settings/lidarrView',
  auth: apiKeyAuth,
  // Lidarr is album-only — no `downloadTrack`.
  downloadAlbum: lidarrDownloadAlbum,
  // ...and the only one that follows an artist: it is a collection manager,
  // where the other two are transfer tools with nobody to watch.
  monitorArtist: lidarrMonitorArtist,
  getQualityProfiles: (config) => lidarr.getQualityProfiles(lidarrConfigOf(config)),
  fetchQueue: async (config) => (await lidarr.fetchQueue(lidarrConfigOf(config))).map(record => ({
    id: record.id,
    percentComplete: record.percentComplete,
    title: record.albumTitle,
    artistName: record.artistName,
    trackCount: record.trackCount,
    warnings: record.statusMessages?.map(message => message.title),
    // One row is an album's worth of Lidarr queue entries, and cancelling the
    // row means cancelling all of them.
    transferIds: record.rawIds.map(String),
    // Lidarr keeps a finished import in the queue while it moves the files,
    // and `trackedDownloadState` is what says so — `status` alone stays
    // "completed" through the import that has not happened yet.
    active: (record.trackedDownloadState ?? '').toLowerCase() !== 'imported',
    // It resolved the album by MBID or id before it ever queued anything.
    identity: 'exact' as const,
  })),
  cancelQueueItem: (config, item) =>
    lidarr.cancelQueueItem(lidarrConfigOf(config), { rawIds: item.transferIds.map(Number) }),
  testConnection: async (config: unknown): Promise<Health> => {
    const ok = await lidarr.testConnection(lidarrConfigOf(config as DownloaderConfig))
    return { ok: Boolean(ok) }
  },
}

function soulsyncConfigOf(config: DownloaderConfig): soulsync.SoulSyncConfig {
  return { serverUrl: config.serverUrl, apiKey: config.apiKey }
}

function slskdConfigOf(config: DownloaderConfig): slskd.SlskdConfig {
  return {
    serverUrl: config.serverUrl,
    apiKey: config.apiKey,
    preferences: config.preferences as SlskdSearchPreferences | undefined,
  }
}

const slskdDownloadAlbum = (config: DownloaderConfig, album: AlbumDownloadRequest) =>
  slskd.downloadAlbum(slskdConfigOf(config), {
    title: album.title,
    artist: album.artist.name,
    // Preserve any MBID the resolver captured — the slskd side uses it to
    // pull canonical strings from MusicBrainz before searching Soulseek.
    mbid: album.externalIds.mbid ?? null,
  })

const slskdDownloadTrack = (config: DownloaderConfig, req: TrackDownloadRequest) =>
  slskd.downloadTrack(slskdConfigOf(config), {
    title: req.title,
    artist: req.artist,
  })

const slskdDownloader: DownloaderDefinition = {
  id: 'slskd',
  // Named for the server the listener runs, like Lidarr and SoulSync.
  // "Soulseek" is the network, and copy uses it only where the network is
  // what failed (nobody sharing a release, a search timing out).
  label: 'slskd',
  descriptionKey: 'externalAlbum.download.slskdDesc',
  albumAddedKey: 'externalAlbum.download.addedToSlskd',
  trackAddedKey: 'externalAlbum.download.addedTrackToSlskd',
  settingsRoute: '/settings/slskdView',
  auth: apiKeyAuth,
  // slskd does both units.
  downloadAlbum: slskdDownloadAlbum,
  downloadTrack: slskdDownloadTrack,
  fetchQueue: async (config) => (await slskd.fetchQueue(slskdConfigOf(config))).map(record => ({
    id: record.id,
    percentComplete: record.percentComplete,
    title: record.title,
    artistName: record.artistName,
    fileCount: record.fileCount,
    sizeBytes: record.size,
    speedBytesPerSec: record.averageSpeed,
    peer: record.username,
    transferIds: record.fileIds,
    active: record.state.toLowerCase() !== 'completed',
    // Soulseek has no album identity — the title came off a remote path.
    identity: 'loose' as const,
  })),
  cancelQueueItem: (config, item) =>
    slskd.cancelQueueItem(slskdConfigOf(config), {
      username: item.peer ?? '',
      fileIds: item.transferIds,
    }),
  testConnection: async (config: unknown): Promise<Health> => {
    const ok = await slskd.testConnection(slskdConfigOf(config as DownloaderConfig))
    return { ok }
  },
}

/**
 * SoulSync takes a track and nothing else. Its public entry point is a single
 * free-text request that runs its own search-match-download pipeline, and it
 * exposes no album endpoint — so this is the first downloader with no
 * `downloadAlbum`, and the reason that field became optional.
 */
const soulsyncDownloadTrack = async (config: DownloaderConfig, req: TrackDownloadRequest): Promise<DownloadResult> => {
  try {
    await soulsync.downloadTrack(soulsyncConfigOf(config), req)
    return { success: true }
  } catch (error) {
    const code = error instanceof soulsync.SoulSyncError ? error.code : undefined
    return { success: false, code, message: (error as Error)?.message ?? 'SoulSync request failed' }
  }
}

const soulsyncDownloader: DownloaderDefinition = {
  id: 'soulsync',
  label: 'SoulSync',
  descriptionKey: 'externalAlbum.download.soulsyncDesc',
  albumAddedKey: 'externalAlbum.download.addedToSoulsync',
  trackAddedKey: 'externalAlbum.download.addedTrackToSoulsync',
  settingsRoute: '/settings/soulsyncView',
  auth: apiKeyAuth,
  // SoulSync is track-only — no `downloadAlbum`.
  downloadTrack: soulsyncDownloadTrack,
  fetchQueue: async (config) => (await soulsync.fetchQueue(soulsyncConfigOf(config))).map(record => ({
    id: record.id,
    percentComplete: record.progress,
    // The album, not the track: this is matched against an album the listener
    // is looking at, and a single track's name would never match one.
    title: record.album || record.title,
    artistName: record.artist,
    albumTitle: record.album || undefined,
    peer: record.username,
    transferIds: [record.id],
    active: record.status.toLowerCase() !== 'completed',
    // SoulSync searches by name, so what it found is a best effort too.
    identity: 'loose' as const,
  })),
  cancelQueueItem: (config, item) =>
    soulsync.cancelDownload(soulsyncConfigOf(config), {
      id: item.id,
      username: item.peer ?? '',
    }),
  testConnection: async (config: unknown): Promise<Health> => {
    const ok = await soulsync.testConnection(soulsyncConfigOf(config as DownloaderConfig))
    return { ok }
  },
}

function downtifyConfigOf(config: DownloaderConfig): downtify.DowntifyConfig {
  return { serverUrl: config.serverUrl }
}

const downtifyDownloadTrack = async (
  config: DownloaderConfig,
  req: TrackDownloadRequest
): Promise<DownloadResult> => {
  try {
    const { jobIds } = await downtify.downloadTrack(downtifyConfigOf(config), req)
    // An empty `job_ids` means the batch was accepted and queued nothing,
    // which is a failure the user needs told about rather than a silent no-op.
    if (jobIds.length === 0) {
      return { success: false, message: 'Downtify queued nothing for this track' }
    }
    return { success: true }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}

const downtifyDownloader: DownloaderDefinition = {
  id: 'downtify',
  label: 'Downtify',
  descriptionKey: 'externalAlbum.download.downtifyDesc',
  albumAddedKey: 'externalAlbum.download.addedToDowntify',
  trackAddedKey: 'externalAlbum.download.addedTrackToDowntify',
  settingsRoute: '/settings/downtifyView',
  auth: noAuth,
  // Track-only, for the same reason SoulSync is. Downtify's album endpoint
  // takes a YouTube Music album URL, which nothing on this side has; an album
  // Get reaches it as its tracks through `albumByTracks`.
  downloadTrack: downtifyDownloadTrack,
  fetchQueue: async (config) => (await downtify.fetchQueue(downtifyConfigOf(config))).map(record => ({
    id: record.id,
    percentComplete: record.progress,
    title: record.title,
    artistName: record.artist,
    transferIds: [record.id],
    // `done` is finished-but-still-listed; the row leaving the queue is what
    // says the file has landed. `error` is not active either — it will never
    // progress, and showing it as running would misreport a failure.
    active: !['done', 'error'].includes(record.status.toLowerCase()),
    // Downtify matches a query against YouTube Music, so what it found is a
    // best effort in exactly the way a Soulseek folder name is.
    identity: 'loose' as const,
    // Downtify's own message is the only account of a failure it gives.
    warnings: record.message ? [record.message] : undefined,
  })),
  cancelQueueItem: (config, item) =>
    downtify.cancelDownload(downtifyConfigOf(config), { id: item.id }),
  testConnection: async (config: unknown): Promise<Health> => {
    const ok = await downtify.testConnection(downtifyConfigOf(config as DownloaderConfig))
    return { ok }
  },
}

export const ALL_DOWNLOADERS: DownloaderDefinition[] = [
  lidarrDownloader,
  slskdDownloader,
  soulsyncDownloader,
  downtifyDownloader,
]

export type DownloaderState = {
  def: DownloaderDefinition
  config: DownloaderConfig
  isConnected: boolean
}

export function useDownloaderStates(): DownloaderState[] {
  const entry = useSelector(selectDownloadersForActiveServer)
  const serverId = useSelector(selectActiveServerId)
  // Not read directly — see `ServersState.credentialsHydrated`. Its only job
  // is to be a dependency that changes once the startup keystore read lands,
  // so `config.apiKey` (below) is recomputed from real values.
  const credentialsHydrated = useSelector(selectCredentialsHydrated)
  // Memoized on `entry`: callers use the returned array as an effect
  // dependency, and a fresh array every render turns those effects into
  // render loops.
  return useMemo(() => ALL_DOWNLOADERS.map((def) => {
    const connection = entry[def.id]
    const apiKey = serverId ? getCredentials(downloaderCredentialScope(def.id, serverId)).apiKey ?? '' : ''
    return {
      def,
      config: {
        serverUrl: connection?.serverUrl ?? '',
        apiKey,
        // Bundling preferences into the config here means every download-time
        // call site — the sheet, the auto-downloader, batch flows — carries
        // them without having to know they exist.
        preferences: connection?.preferences,
      },
      isConnected: connection?.isAuthenticated === true,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- credentialsHydrated is the recompute trigger described above, not a value read here
  }), [entry, serverId, credentialsHydrated])
}

export function useAnyDownloaderConnected(): boolean {
  return useDownloaderStates().some((d) => d.isConnected)
}

export function useAnyTrackDownloaderConnected(): boolean {
  return useDownloaderStates().some((d) => d.isConnected && !!d.def.downloadTrack)
}

/**
 * Somewhere to send a whole album. A downloader with no album endpoint still
 * counts: the Get sheet sends it the album as its tracks (`albumByTracks`), so
 * a listener with only SoulSync connected is offered Get on an album too.
 */
export function useAnyAlbumDownloaderConnected(): boolean {
  return useDownloaderStates().some((d) => d.isConnected && !!(d.def.downloadAlbum || d.def.downloadTrack))
}

/**
 * Somewhere to send an artist. Unlike an album, there is no standing-in for
 * this: an artist cannot be followed as a list of tracks, so a want for one
 * stays a bookmark until something that watches artists is connected.
 */
export function useAnyArtistDownloaderConnected(): boolean {
  return useDownloaderStates().some((d) => d.isConnected && !!d.def.monitorArtist)
}

/** The connected downloaders that can take this unit, in registry order. */
export function useDownloadersForUnit(unit: 'album' | 'track' | 'artist'): DownloaderState[] {
  const states = useDownloaderStates()
  return useMemo(() => states.filter((d) => {
    if (!d.isConnected) return false
    if (unit === 'artist') return !!d.def.monitorArtist
    if (unit === 'track') return !!d.def.downloadTrack
    return !!(d.def.downloadAlbum || d.def.downloadTrack)
  }), [states, unit])
}

/** Re-exported so a caller keeps one import for the whole downloader contract. */
export type { ArtistMonitorPolicy } from './artistMonitor'
