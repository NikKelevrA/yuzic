/**
 * "Tap a song you don't own yet and have it start playing" — for a
 * self-hosted setup where that is a real, closed loop: MusicBrainz search
 * found the track, the resolver can fetch it, and the server it lands on is
 * the same one this app streams from. None of that holds against the shared
 * public MusicBrainz server or with no resolver connected, so this always
 * checks both before doing anything — see `canAcquireAndPlay`.
 *
 * Two steps, and only the second is genuinely uncertain:
 *   1. Already in the library? Play it. No network request at all.
 *   2. Not yet? Ask YT Fallback's `/resolve` — "do you have this, or go get
 *      it" — and act on whatever it says: `ready` plays immediately, `failed`
 *      says so, `pending` shows one toast and starts polling the *same* call
 *      until it flips.
 *
 * This used to be a three-step dance: pick a downloader (track-capable
 * first, Lidarr's whole-album as a fallback), send it a free-text Get, then
 * separately ask the server to scan and force this app's own library sync,
 * polling *that* — hoping it eventually agreed the track had landed. That
 * indirection was the actual source of the bugs worth naming: two
 * independent Gets racing for the same file because nothing deduplicated
 * them, and a wait that depended on this app's own sync (throttled,
 * sometimes stale, occasionally just never re-triggered after a poll gave
 * up) rather than on the one thing that actually knew the truth. `/resolve`
 * moves all of that server-side — matching, deduping, waiting — and this
 * hook is left with almost nothing to get wrong: ask, act on the answer,
 * ask again if it says "still working."
 *
 * Lidarr's whole-album fallback is gone from this path on purpose: it isn't
 * behind `/resolve` (that endpoint is specifically the slskd-then-YouTube
 * service), so a Lidarr-only setup now falls through to the ordinary Want/Get
 * sheet instead of auto-playing. That sheet already offers Lidarr directly.
 *
 * Scoped to the row that calls it, not a background service: navigating away
 * unmounts the row and stops the wait. A song that finishes resolving after
 * you've moved on is still sitting there next time you search for it — the
 * resolver doesn't forget — but this hook won't surface it with a toast or
 * an autoplay you're not there to see.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { notify } from '@/components/toast';
import { useLocalFirst } from '@/features/library/useLocalFirst';
import { usePlayableSongResolver } from '@/features/song/usePlayableSongResolver';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { useSelfHostedMusicbrainzConfigured } from '@/features/settings/sources/useSelfHostedMusicbrainzConfigured';
import * as ytfallback from '@/providers/integration/ytfallback';
import { useDownloaderStates } from './registry';

/** How long to keep polling the resolver before giving up. A Soulseek
 *  transfer (or a cold YouTube download + transcode) can genuinely take
 *  minutes, and giving up early would turn "downloading, hang on" into a
 *  silent nothing-happened. */
const ACQUIRE_TIMEOUT_MS = 3 * 60 * 1000;
/** `/resolve` is cheap and idempotent — this is just how often to re-ask it
 *  while something is pending. */
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
  const { localSong } = useLocalFirst();
  const { resolvePlayableSong } = usePlayableSongResolver();
  const { playSong } = usePlayingActions();

  const selfHostedMusicbrainzConfigured = useSelfHostedMusicbrainzConfigured();
  // The resolver lives behind the YT Fallback service specifically — see
  // `/resolve` in `providers/integration/ytfallback`. Read through the
  // ordinary downloader connection state rather than a connection type of
  // its own: it's the same service, same credentials, just one more endpoint
  // on it.
  const resolverState = useDownloaderStates().find(d => d.def.id === 'ytfallback');
  const resolverConnected = resolverState?.isConnected ?? false;
  const resolverConfig: ytfallback.YtFallbackConfig | null = resolverState
    ? { serverUrl: resolverState.config.serverUrl, apiKey: resolverState.config.apiKey }
    : null;

  /** True once the resolver is not just configured but actually connected.
   *  Read by callers to decide whether to keep their own fallback UI
   *  (Want/Get sheet, preview) instead of calling `acquireAndPlay`. */
  const canAcquireAndPlay = selfHostedMusicbrainzConfigured && resolverConnected;

  const [pending, setPending] = useState<PendingAcquire | null>(null);
  const pendingRef = useRef<PendingAcquire | null>(null);
  pendingRef.current = pending;

  const playByNativeId = useCallback(async (nativeId: string) => {
    const resolved = await resolvePlayableSong(nativeId);
    if (resolved) {
      await playSong(resolved.song);
      return true;
    }
    return false;
  }, [resolvePlayableSong, playSong]);

  const resolveRequestOf = (song: Song) => ({
    title: song.title,
    artist: song.artist.name,
    mbid: song.externalIds.mbid,
    isrc: song.externalIds.isrc,
  });

  // The polling half: re-asks `/resolve` on an interval while something is
  // pending, acts on whatever it answers, and gives up (with a toast, not
  // silently) past the deadline.
  useEffect(() => {
    if (!pending || !resolverConfig) return;

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

      let result: ytfallback.ResolveResult;
      try {
        result = await ytfallback.resolve(resolverConfig, resolveRequestOf(pending.song));
      } catch {
        return; // transient — the next tick tries again.
      }
      if (pendingRef.current !== pending) return;

      if (result.status === 'ready') {
        setPending(null);
        const ok = await playByNativeId(result.songId);
        if (!ok) notify.error(t('externalAlbum.download.acquirePlayFailed', { title: pending.song.title }));
      } else if (result.status === 'failed') {
        setPending(null);
        notify.error(t('externalAlbum.download.acquireNotFound', { title: pending.song.title }));
      }
      // 'pending' — keep polling.
    };

    const id = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
    // Fire once right away rather than waiting a full interval for the first
    // check — the toast already told the user this is happening now.
    void tick();
    return () => clearInterval(id);
  }, [pending, resolverConfig, playByNativeId, t]);

  /**
   * Called on tap. Returns `true` once it has taken over — either playing
   * immediately (already owned, or the resolver already had it), reporting
   * a definite failure, or having started a wait (a toast is already
   * showing). Returns `false` when nothing could be done at all (no
   * self-hosted MusicBrainz, or no resolver connected), so the caller knows
   * to fall back to whatever it would otherwise have done.
   */
  const acquireAndPlay = useCallback(async (song: Song, _albumStub: Album): Promise<boolean> => {
    const owned = localSong(song);
    if (owned) {
      const played = await playByNativeId(owned.nativeId);
      if (!played) notify.error(t('externalAlbum.download.acquirePlayFailed', { title: song.title }));
      return played;
    }

    if (!canAcquireAndPlay || !resolverConfig) return false;

    let result: ytfallback.ResolveResult;
    try {
      result = await ytfallback.resolve(resolverConfig, resolveRequestOf(song));
    } catch {
      notify.error(t('externalAlbum.download.acquireNotFound', { title: song.title }));
      return true;
    }

    if (result.status === 'ready') {
      const ok = await playByNativeId(result.songId);
      if (!ok) notify.error(t('externalAlbum.download.acquirePlayFailed', { title: song.title }));
      return true;
    }
    if (result.status === 'failed') {
      notify.error(t('externalAlbum.download.acquireNotFound', { title: song.title }));
      return true;
    }

    notify.loading(t('externalAlbum.download.acquireDownloading', { title: song.title }), {
      id: `acquire-play:${song.localId}`,
    });
    setPending({ song, startedAt: Date.now() });
    return true;
  }, [localSong, playByNativeId, canAcquireAndPlay, resolverConfig, t]);

  return { canAcquireAndPlay, selfHostedMusicbrainzConfigured, acquireAndPlay };
}
