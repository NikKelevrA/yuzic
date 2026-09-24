/**
 * "Tap a song you don't own yet and have it start playing" — for a
 * self-hosted setup where that is a real, closed loop: MusicBrainz search
 * found the track, a downloader can fetch it, and the server it lands on is
 * the same one this app streams from. None of that holds against the shared
 * public MusicBrainz server or with no downloader connected, so this always
 * checks both before doing anything — see `canAcquireAndPlay`.
 *
 * Three steps, and only the middle one is genuinely uncertain:
 *   1. Already in the library? Play it. No downloader involved at all.
 *   2. Not yet? Send it to whichever connected downloader can take a single
 *      track (`downloadTrack`), or — Lidarr being album-only — the whole
 *      album to whichever can take that, via the same `runGet` the manual
 *      Get sheet uses. One notification, not a review sheet: this is the
 *      "just play it" path, not the "let me pick a quality profile" one.
 *   3. Wait for it to actually arrive. A downloader finishing writes into the
 *      *server's* library the way a manual copy would — this app has no way
 *      to know until the server scans and this app resyncs from it. So this
 *      polls: ask the server to scan, force a resync, and check whether
 *      `useLocalFirst`'s index now resolves the song. That index is rebuilt
 *      from fresh query-cache data on every successful sync (see
 *      `useCatalogStore`), which is why this is a `useEffect` reacting to a
 *      changing `localSong` rather than one async function closing over a
 *      snapshot of it — a closure taken before the first sync landed would
 *      keep checking the library the request started with, forever.
 *
 * Scoped to the row that calls it, not a background service: navigating away
 * unmounts the row and stops the wait. A song that finishes downloading after
 * you've moved on updates your library like any other sync, but this hook
 * will not surface it with a toast or an autoplay you're not there to see.
 * Worth revisiting as a standing provider (`DownloadersQueueProvider` is the
 * shape) if that turns out to matter in practice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { notify } from '@/components/toast';
import { useApi } from '@/providers/registry/useApi';
import { useSync } from '@/features/library/useSync';
import { useLocalFirst } from '@/features/library/useLocalFirst';
import { usePlayableSongResolver } from '@/features/song/usePlayableSongResolver';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { useSelfHostedMusicbrainzConfigured } from '@/features/settings/sources/useSelfHostedMusicbrainzConfigured';
import { useDownloadersForUnit } from './registry';
import { runGet } from './runGet';

/** How long to keep polling after a Get before giving up and letting the
 *  ordinary sync cadence pick it up eventually. Generous on purpose — a
 *  Soulseek transfer can genuinely take minutes, and giving up early would
 *  turn "downloading, hang on" into a silent nothing-happened. */
const ACQUIRE_TIMEOUT_MS = 3 * 60 * 1000;
/** Every tick asks the server to scan and forces a resync — both already
 *  cheap/idempotent (`sync(true)` no-ops if a sync is already in flight) —
 *  rather than waiting on the ambient 30s `DownloadersQueueContext` poll,
 *  which exists for a different job (the queue screens) and isn't guaranteed
 *  to be running for the connected downloader this request went to. */
const POLL_INTERVAL_MS = 12_000;

type PendingAcquire = {
  song: Song;
  startedAt: number;
};

/** Pure so the deadline arithmetic can be checked directly, without a timer
 *  or an effect in the way — see the test file. */
export function hasReachedAcquireDeadline(startedAt: number, now: number): boolean {
  return now - startedAt >= ACQUIRE_TIMEOUT_MS;
}

export function useAcquireAndPlaySong() {
  const { t } = useTranslation();
  const api = useApi();
  const { sync } = useSync();
  const { localSong } = useLocalFirst();
  const { resolvePlayableSong } = usePlayableSongResolver();
  const { playSong } = usePlayingActions();

  const selfHostedMusicbrainzConfigured = useSelfHostedMusicbrainzConfigured();
  const trackDownloaders = useDownloadersForUnit('track');
  const albumDownloaders = useDownloadersForUnit('album');

  /** True once a downloader is not just connected but able to take *some*
   *  form of this request — a track directly, or (Lidarr) the album it's
   *  on. Read by callers to decide whether to keep their own fallback UI
   *  (Want/Get sheet, preview) instead of calling `acquireAndPlay`. */
  const canAcquireAndPlay = selfHostedMusicbrainzConfigured
    && (trackDownloaders.length > 0 || albumDownloaders.length > 0);

  const [pending, setPending] = useState<PendingAcquire | null>(null);
  const pendingRef = useRef<PendingAcquire | null>(null);
  pendingRef.current = pending;

  const playLocal = useCallback(async (found: Song) => {
    const resolved = await resolvePlayableSong(found.nativeId);
    if (resolved) {
      await playSong(resolved.song);
      return true;
    }
    return false;
  }, [resolvePlayableSong, playSong]);

  // Step 3 (the "did it arrive" half): re-checks the moment `localSong`
  // itself changes identity, which is exactly when a sync has landed new
  // data — see the file doc comment on why this isn't a plain async loop.
  useEffect(() => {
    if (!pending) return;
    const found = localSong(pending.song);
    if (!found) return;
    setPending(null);
    void playLocal(found).then(ok => {
      if (!ok) notify.error(t('externalAlbum.download.acquirePlayFailed', { title: pending.song.title }));
    });
  }, [pending, localSong, playLocal, t]);

  // The polling half: nudges the server/sync on an interval while something
  // is pending, and gives up (with a toast, not silently) past the timeout.
  useEffect(() => {
    if (!pending) return;

    const tick = async () => {
      // Stale timer from a request that already resolved or was superseded.
      if (pendingRef.current !== pending) return;
      if (hasReachedAcquireDeadline(pending.startedAt, Date.now())) {
        if (pendingRef.current === pending) {
          setPending(null);
          notify.info(t('externalAlbum.download.acquireStillWorking', { title: pending.song.title }));
        }
        return;
      }
      try { await api.auth.startScan(); } catch { /* server may not support/allow this; sync alone still helps */ }
      try { await sync(true); } catch { /* transient — the next tick tries again */ }
    };

    const id = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
    // Fire once right away rather than waiting a full interval for the first
    // scan/sync — the toast already told the user this is happening now.
    void tick();
    return () => clearInterval(id);
  }, [pending, api, sync, t]);

  /**
   * Called on tap. Returns `true` once it has taken over — either playing
   * immediately (already owned) or having started a Get and begun waiting
   * (a toast is already showing). Returns `false` when nothing could be
   * done (no capable downloader, or the request itself failed to send — a
   * toast covers that case too, via `runGet`), so the caller knows to fall
   * back to whatever it would otherwise have done.
   */
  const acquireAndPlay = useCallback(async (song: Song, albumStub: Album): Promise<boolean> => {
    const owned = localSong(song);
    if (owned) return playLocal(owned);

    if (!canAcquireAndPlay) return false;

    const trackState = trackDownloaders[0];
    const albumState = albumDownloaders[0];

    let sent: boolean;
    if (trackState) {
      sent = await runGet({
        downloader: trackState,
        album: albumStub,
        track: { title: song.title, artist: song.artist.name },
        t,
        // Never reached: a track-capable downloader downloads the track
        // directly (`track` is set above), never the album by its tracks.
        loadTracks: async () => [],
      });
    } else if (albumState) {
      sent = await runGet({
        downloader: albumState,
        album: albumStub,
        t,
        // Only reached if `albumState.def.downloadAlbum` is absent, which
        // isn't possible for what `useDownloadersForUnit('album')` returns
        // when no track downloader is connected (Lidarr, the only such
        // downloader, always has one). Kept honest rather than `undefined!`.
        loadTracks: async () => [{ title: song.title, artist: song.artist.name }],
      });
    } else {
      return false;
    }

    if (!sent) return true; // runGet already reported the failure via toast.

    notify.loading(t('externalAlbum.download.acquireDownloading', { title: song.title }), {
      id: `acquire-play:${song.localId}`,
    });
    setPending({ song, startedAt: Date.now() });
    return true;
  }, [localSong, playLocal, canAcquireAndPlay, trackDownloaders, albumDownloaders, t]);

  return { canAcquireAndPlay, acquireAndPlay };
}
