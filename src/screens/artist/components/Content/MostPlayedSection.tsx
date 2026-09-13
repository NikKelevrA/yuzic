import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSelector } from 'react-redux'
import { useTheme } from '@/hooks/useTheme'
import { useTranslation } from 'react-i18next'
import { notify } from '@/components/toast';
import { selectSongPlayCounts } from '@/state/redux/selectors/statsSelectors'
import { useTracks } from '@/hooks/tracks'
import { usePlayingActions } from '@/contexts/PlayingContext'
import { usePlayableSongResolver } from '@/hooks/songs'
import TopTrackRow from '@/components/rows/TopTrackRow'
import { rankMostPlayedTracks } from './mostPlayed'
import type { Artist } from '@/domain/entities/Artist'
import { spacing, typography } from '@/constants/design'

type Props = {
  artist: Artist
}

// Your own listening history for this artist — a different claim from
// PopularOnDeezerSection's chart data, so it's a separate, separately-labeled
// section rather than a merged sub-group.
export default function MostPlayedSection({ artist }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { tracks } = useTracks()
  const playCounts = useSelector(selectSongPlayCounts)
  const { playSong } = usePlayingActions()
  const { resolvePlayableSong } = usePlayableSongResolver()

  // `rankMostPlayedTracks` works over a generic `{ id, artistId }` shape —
  // play counts are keyed by nativeId (server-scoped), so that's what feeds
  // it, not the domain identity.
  const playCountTracks = tracks.map(track => ({ id: track.nativeId, artistId: track.artist.nativeId }))
  const ranked = rankMostPlayedTracks(playCountTracks, playCounts, artist.nativeId)
  if (ranked.length === 0) return null

  const tracksByNativeId = new Map(tracks.map(t => [t.nativeId, t]))

  const handlePress = async (nativeId: string) => {
    try {
      const resource = await resolvePlayableSong(nativeId);
      if (resource) await playSong(resource.song);
    } catch {
      notify.error(t('common.playbackError'));
    }
  }

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.secondary }]}>
          {t('artist.sections.mostPlayed')}
        </Text>
      </View>
      {ranked.map((ranking, index) => {
        const track = tracksByNativeId.get(ranking.id);
        if (!track) return null;
        return (
          <TopTrackRow
            key={track.localId}
            song={track}
            index={index}
            artistName={artist.name}
            onPress={() => { void handlePress(track.nativeId); }}
          />
        );
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  sectionHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.controlGap,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.navigationTitle,
  },
})
