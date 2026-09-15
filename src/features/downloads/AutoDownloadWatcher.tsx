import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { notify } from '@/components/toast';
import { useTranslation } from 'react-i18next';
import { useDownloadActions, useDownloadState } from '@/features/offline/DownloadContext';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { selectAutoDownloadNewSongs } from '@/features/settings/downloads/state';
import { useTracks } from '@/features/song/useTracks';

/**
 * Watches the synced library track list and auto-downloads additions when the
 * setting is enabled (#130). The known-ID baseline (re)initializes on first
 * population and on server switch, so a wholesale list swap — fresh install,
 * rehydration, changing servers — never triggers a mass download; only tracks
 * that appear after a baseline exists count as new.
 */
export function AutoDownloadWatcher() {
  const { t } = useTranslation();
  const enabled = useSelector(selectAutoDownloadNewSongs);
  const activeServer = useSelector(selectActiveServer);
  const { tracks } = useTracks();
  const { downloadTracks } = useDownloadActions();
  const { isTrackDownloaded } = useDownloadState();
  const knownRef = useRef<{ serverId: string | null; ids: Set<string> | null }>({
    serverId: null,
    ids: null,
  });

  useEffect(() => {
    const serverId = activeServer?.id ?? null;
    const prev = knownRef.current;
    const ids = new Set(tracks.map(track => track.localId));

    if (prev.serverId !== serverId || prev.ids === null || prev.ids.size === 0) {
      knownRef.current = { serverId, ids };
      return;
    }

    const known = prev.ids;
    knownRef.current = { serverId, ids };

    if (!enabled) return;
    const newTracks = tracks.filter(track => !known.has(track.localId) && !isTrackDownloaded(track.localId));
    if (!newTracks.length) return;

    // The queue resolves each track's fresh stream URL from the domain song,
    // so the library list entries are enough to enqueue as-is.
    void downloadTracks(newTracks);
    notify.info(t('settings.library.downloads.autoDownloadStarted', { count: newTracks.length }));
  }, [tracks, activeServer?.id, enabled, downloadTracks, isTrackDownloaded, t]);

  return null;
}
