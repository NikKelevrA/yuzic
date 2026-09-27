/**
 * The YT Fallback adapter, split into its own file rather than inlined in
 * `registry.ts` alongside Lidarr. `registry.ts` sits close to the 400-line
 * architecture gate (`tools/architecture/check-file-shape.mjs`) —
 * `definition.ts` was carved out of it for the same reason, back when it
 * still carried slskd/SoulSync/Downtify too — and a second downloader's
 * worth of glue inline would have pushed it over. `registry.ts` just imports
 * the finished definition and slots it into `ALL_DOWNLOADERS`.
 */
import * as ytfallback from '@/providers/integration/ytfallback'
import type { Health } from '@/providers/contracts/Provider'
import type {
  DownloadResult,
  DownloaderConfig,
  DownloaderDefinition,
  TrackDownloadRequest,
} from '../definition'

function ytfallbackConfigOf(config: DownloaderConfig): ytfallback.YtFallbackConfig {
  return { serverUrl: config.serverUrl, apiKey: config.apiKey }
}

/**
 * A single free-text request — the service does its own slskd-then-YouTube
 * fallback chain behind it, so nothing here needs to know there are two
 * paths inside it.
 */
const ytfallbackDownloadTrack = async (
  config: DownloaderConfig,
  req: TrackDownloadRequest
): Promise<DownloadResult> => {
  try {
    await ytfallback.downloadTrack(ytfallbackConfigOf(config), req)
    return { success: true }
  } catch (error) {
    return { success: false, message: (error as Error)?.message ?? 'YT Fallback request failed' }
  }
}

export const ytfallbackDownloader: DownloaderDefinition = {
  id: 'ytfallback',
  label: 'YT Fallback',
  descriptionKey: 'externalAlbum.download.ytfallbackDesc',
  albumAddedKey: 'externalAlbum.download.addedToYtfallback',
  trackAddedKey: 'externalAlbum.download.addedTrackToYtfallback',
  settingsRoute: '/settings/ytfallbackView',
  auth: { tier: 'apiKey', configKeys: ['serverUrl', 'apiKey'] },
  // Track-only — a Get sheet reaches it for an album as that album's tracks
  // (`albumByTracks`).
  downloadTrack: ytfallbackDownloadTrack,
  fetchQueue: async (config) => (await ytfallback.fetchQueue(ytfallbackConfigOf(config))).map(record => ({
    id: record.id,
    percentComplete: record.progress,
    title: record.title,
    artistName: record.artist,
    transferIds: [record.id],
    // `done` is finished-but-still-listed; disappearing from the queue is
    // still the real completion signal, same as every other downloader here.
    active: !['done', 'error'].includes(record.status.toLowerCase()),
    // Matched by title/artist against slskd or a YouTube search, not
    // resolved against a catalogue — the same "best effort" identity every
    // other free-text downloader here reports.
    identity: 'loose' as const,
    warnings: record.error ? [record.error] : undefined,
  })),
  cancelQueueItem: (config, item) =>
    ytfallback.cancelDownload(ytfallbackConfigOf(config), { id: item.id }),
  testConnection: async (config: unknown): Promise<Health> => {
    const ok = await ytfallback.testConnection(ytfallbackConfigOf(config as DownloaderConfig))
    return { ok }
  },
}
