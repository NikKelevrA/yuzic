import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { notify } from '@/components/toast';

import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import {
  selectPlaylistImportServerUrl,
  selectPlaylistImportAttempted,
  useIsPlaylistImportConfigured,
} from '@/state/redux/selectors/playlistImportSelectors';
import { recordPlaylistImportAttempts } from '@/state/redux/slices/playlistImportSlice';
import { fetchPlaylistStatus } from '@/providers/integration/playlistImport';
import { useDownloadersForUnit } from '@/features/downloaders/registry';

/**
 * How often to ask the watchlist proxy what's still pending. Generous on
 * purpose — this is a background sweep, not a "did it arrive yet" wait loop
 * like `useAcquireAndPlaySong`, and the proxy itself already re-checks
 * pending tracks on its own schedule (see the addendum brief).
 */
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Once a track has been sent to a downloader, don't send it again for this
 * long even if the next poll still lists it pending — acquisition can
 * genuinely take a while, and re-sending the same request every ten minutes
 * would just spam the downloader with duplicates of a transfer already in
 * flight.
 */
const ATTEMPT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * How long a de-dupe entry is kept at all — matches the proxy's own 14-day
 * retry window (`playlist-import-missing-tracks-addendum.md`), so the stored
 * map never outlives the thing it's tracking.
 */
const ATTEMPT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Fully-automatic acquisition for tracks a playlist import is still missing —
 * the one deliberate, narrow exception to this app's otherwise-universal
 * "never download without an explicit tap" rule (see the doc comment on
 * `useWantGet`). This is scoped exactly the way it was decided: playlist
 * import origin only, nothing else about download behavior changes.
 *
 * The proxy owns matching, playlist creation/rebuild, and its own 14-day
 * retry window (see the addendum brief) — this hook's only job is to ask it
 * what's still missing and hand each still-pending track to whichever
 * connected downloader takes a single track. It never touches the Wants
 * system, never shows a per-track toast (constant background noise for
 * something the user didn't ask for track-by-track), and never blocks on the
 * result — the next poll, or the proxy's own recheck, is what notices a
 * track actually landed and rebuilds the Navidrome playlist.
 *
 * Mounted once, in the home layout, next to `useWantArrivalWatcher` — same
 * "ambient background effect with no UI of its own" shape.
 */
export function usePlaylistImportSync(): void {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id ?? null;
  // The proxy tracks progress per Navidrome account — this is the value it
  // expects as `target_user`.
  const targetUser = activeServer?.username ?? null;
  const serverUrl = useSelector(selectPlaylistImportServerUrl);
  const isConfigured = useIsPlaylistImportConfigured();
  const attempted = useSelector(selectPlaylistImportAttempted);
  const trackDownloaders = useDownloadersForUnit('track');

  // Read inside the interval via refs rather than as effect deps, so a
  // downloader's own queue poll (which changes `trackDownloaders`'s config
  // object identity far more often than the set of connected downloaders
  // actually changes) doesn't tear down and restart the sync interval.
  const attemptedRef = useRef(attempted);
  attemptedRef.current = attempted;
  const downloadersRef = useRef(trackDownloaders);
  downloadersRef.current = trackDownloaders;

  useEffect(() => {
    if (!isConfigured || !serverId || !targetUser || trackDownloaders.length === 0) return;

    let cancelled = false;

    const tick = async () => {
      let statuses: Awaited<ReturnType<typeof fetchPlaylistStatus>>;
      try {
        statuses = await fetchPlaylistStatus({ serverUrl }, targetUser);
      } catch {
        // Proxy unreachable this cycle — the next tick tries again. Silent:
        // this is a background sweep, not a user-initiated action waiting on
        // feedback.
        return;
      }
      if (cancelled) return;

      const downloader = downloadersRef.current[0];
      const downloadTrack = downloader?.def.downloadTrack;
      if (!downloader || !downloadTrack) return;
      const downloaderConfig = downloader.config;

      const now = Date.now();
      const toSend: { key: string; title: string; artist: string }[] = [];
      for (const playlist of statuses) {
        for (const track of playlist.pending) {
          if (track.retryExpired) continue;
          const key = `${playlist.playlistId}:${track.spotifyId}`;
          const lastAttempt = attemptedRef.current[key];
          if (lastAttempt && now - lastAttempt < ATTEMPT_COOLDOWN_MS) continue;
          toSend.push({ key, title: track.title, artist: track.artist });
        }
      }
      if (toSend.length === 0) return;

      let sentCount = 0;
      for (const track of toSend) {
        try {
          const result = await downloadTrack(downloaderConfig, { title: track.title, artist: track.artist });
          if (result.success) sentCount += 1;
        } catch {
          // One track failing to queue is not worth aborting the rest of the
          // sweep over — the next poll tries it again once its cooldown lapses.
        }
      }
      if (cancelled) return;

      dispatch(recordPlaylistImportAttempts({
        serverId,
        keys: toSend.map(track => track.key),
        at: now,
        retentionMs: ATTEMPT_RETENTION_MS,
      }));

      if (sentCount > 0) {
        notify.info(t('settings.playlistImport.autoAcquireStarted', { count: sentCount }));
      }
    };

    const id = setInterval(() => { void tick(); }, SYNC_INTERVAL_MS);
    void tick();
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attempted/trackDownloaders are read via refs above; only these identities should restart the interval
  }, [isConfigured, serverId, serverUrl, targetUser, trackDownloaders.length, dispatch, t]);
}
