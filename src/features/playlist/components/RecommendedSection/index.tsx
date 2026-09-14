import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { QueryKeys } from '@/state/query/queryKeys';
import { spacing } from '@/constants/design';
import { playlistArtistNames as computePlaylistArtistNames } from '@/features/playlist/recommendedSongs';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { LocalRecommendedSection } from './LocalRecommendedSection';
import { ExternalRecommendedSection } from './ExternalRecommendedSection';

export { LocalRecommendedSection } from './LocalRecommendedSection';
export { ExternalRecommendedSection } from './ExternalRecommendedSection';

type RecommendedSectionProps = {
  playlist: Playlist;
  songs: Song[];
};

/**
 * The playlist screen's "Recommended" footer: local-library picks (AudioMuse
 * similarity, or a same-artist fallback) above a Deezer/Last.fm discovery
 * rail. Each rail is its own component (`LocalRecommendedSection`,
 * `ExternalRecommendedSection`) — this just owns the refresh seed/query-key
 * state both rails need a handle on.
 */
const RecommendedSection: React.FC<RecommendedSectionProps> = ({ playlist, songs }) => {
  const queryClient = useQueryClient();
  const [localSeed, setLocalSeed] = useState(() => Math.random());

  const playlistArtistNames = useMemo(() => computePlaylistArtistNames(songs), [songs]);

  const externalQueryKey = useMemo(
    () => [QueryKeys.RecommendedExternalSongs, 'playlist', playlist.nativeId, playlistArtistNames.join(',')],
    [playlist.nativeId, playlistArtistNames]
  );

  const handleRefreshLocal = useCallback(() => {
    setLocalSeed(Math.random());
  }, []);

  const handleRefreshExternal = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: externalQueryKey });
  }, [queryClient, externalQueryKey]);

  return (
    <View style={styles.container}>
      <LocalRecommendedSection
        playlist={playlist}
        songs={songs}
        localSeed={localSeed}
        onRefresh={handleRefreshLocal}
      />
      <ExternalRecommendedSection
        playlist={playlist}
        songs={songs}
        onRefreshExternal={handleRefreshExternal}
      />
    </View>
  );
};

export default RecommendedSection;

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xxxl,
  },
});
