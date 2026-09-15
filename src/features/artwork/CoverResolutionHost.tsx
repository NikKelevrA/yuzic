import { useEffect } from 'react';
import { useSelector } from 'react-redux';

import { useAlbums } from '@/features/album/useAlbums';
import { useArtists } from '@/features/artist/useArtists';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { selectEnabledSourcesFor } from '@/features/settings/sources/state';
import { setCoverResolutionContext } from './coverResolution';

/**
 * Hands cover resolution what it reads outside React: the library to find an
 * item's own copy in, the artwork backups switched on, and whether the device
 * is online. Renders nothing.
 */
export default function CoverResolutionHost() {
  const { artists } = useArtists();
  const { albums } = useAlbums();
  const backups = useSelector(selectEnabledSourcesFor('artwork'));
  const online = !useIsOffline();

  useEffect(() => {
    setCoverResolutionContext({ artists, albums, backups, online });
  }, [artists, albums, backups, online]);

  return null;
}
