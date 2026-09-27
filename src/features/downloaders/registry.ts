import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import * as lidarr from '@/providers/integration/lidarr'
import { ytfallbackDownloader } from './adapters/ytfallback'
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
} from './definition'

export { downloadErrorKey } from './errorKeys'

export type { DownloaderId }
export type { QualityProfile } from './definition'

/** Lidarr authenticates with a server URL plus an API key. */
const apiKeyAuth = { tier: 'apiKey' as const, configKeys: ['serverUrl', 'apiKey'] }

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

/**
 * `ALL_DOWNLOADERS` used to also carry slskd, SoulSync and Downtify as
 * separately pickable options. All three are gone: SoulSync and Downtify
 * were superseded by YT Fallback (which already tries slskd internally
 * before falling back to YouTube — see
 * `providers/integration/ytfallback`), and keeping plain slskd alongside it
 * as its own choice was exactly the kind of decision a self-hosted setup
 * shouldn't have to make — YT Fallback is a strict superset of it. Lidarr
 * is untouched: it predates this fork's downloader work and remains the
 * one place for a deliberate whole-album Get.
 */
export const ALL_DOWNLOADERS: DownloaderDefinition[] = [
  lidarrDownloader,
  ytfallbackDownloader,
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
 * a listener with only YT Fallback connected is offered Get on an album too.
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
