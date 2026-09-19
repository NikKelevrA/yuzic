// The store itself, not the barrel: that re-exports `ToastHost` and pulls a
// React component tree in behind it, which this module has no business
// loading. `notify.ts` is deliberately framework-free for exactly this.
import { notify } from '@/components/toast/notify';
import { downloadAlbumByTracks } from './albumByTracks';
import { downloadErrorKey, type DownloaderState } from './registry';
import type { Album } from '@/domain/entities/Album';

type TrackRequest = { title: string; artist: string };

type Translate = (key: string, opts?: Record<string, unknown>) => string;

type GetRequest = {
  downloader: DownloaderState;
  album: Album;
  /** Set when the Get is for one track rather than the whole album. */
  track?: TrackRequest;
  /** Only meaningful for an album, and only where the downloader offers profiles. */
  qualityProfileId?: number;
  /** Asked only when the chosen downloader has to send an album track by track. */
  loadTracks: (album: Album) => Promise<TrackRequest[]>;
  t: Translate;
};

/**
 * One acquisition, reported through the toasts rather than through a sheet.
 *
 * This used to live inside `GetReviewSheet`, which meant the review stayed on
 * screen for as long as the request took and could not be swiped away while it
 * ran. That is fine against Lidarr, which is one call. It is not fine against a
 * track-only downloader, where an album is one round trip *per track* sent
 * deliberately one at a time — a twelve-track record is twelve waits behind a
 * spinner you cannot dismiss.
 *
 * So the confirm tap closes the sheet and the work continues here. Nothing in
 * this module touches React, which is what makes that safe: the caller can
 * unmount the moment it has handed the request over.
 *
 * Every stage writes to one toast id, so a Get reports as a single thing that
 * changes — sending, then counting tracks, then its outcome — rather than
 * stacking three notifications for one tap.
 */
export async function runGet({
  downloader,
  album,
  track,
  qualityProfileId,
  loadTracks,
  t,
}: GetRequest): Promise<boolean> {
  const { def, config } = downloader;
  // Stable per target, so asking twice replaces the first report instead of
  // stacking a second one beside it.
  const toastId = `get:${album.localId ?? album.nativeId}:${track?.title ?? ''}`;
  const subject = track ? track.title : album.title;

  notify.loading(t('externalAlbum.download.sending', { title: subject, downloader: def.label }), {
    id: toastId,
  });

  try {
    const result = track
      ? await def.downloadTrack!(config, { title: track.title, artist: track.artist })
      : def.downloadAlbum
        ? await def.downloadAlbum(config, album, qualityProfileId !== undefined ? { qualityProfileId } : undefined)
        : await downloadAlbumByTracks(
            def.downloadTrack!,
            config,
            await loadTracks(album),
            (done, total) => {
              notify.loading(t('externalAlbum.download.progress', { done, total }), { id: toastId });
            }
          );

    if (result.success) {
      notify.success(t(track ? def.trackAddedKey! : def.albumAddedKey), { id: toastId });
      return true;
    }

    notify.error(
      t(downloadErrorKey(def.id, result.code), { defaultValue: t('externalAlbum.download.failed') }),
      { id: toastId }
    );
    return false;
  } catch {
    notify.error(t('externalAlbum.download.startFailed'), { id: toastId });
    return false;
  }
}
