import React, { memo } from 'react'
import { StyleSheet, Text } from 'react-native'
import { Play } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import MediaListRow from '@/components/MediaListRow'
import { useTheme } from '@/hooks/useTheme'
import { formatDuration, formatSongDuration } from '@/utils/formatDuration'
import type { ExternalSong } from '@/types'
import type { Song } from '@/domain/entities/Song'
import Touchable from '@/components/Touchable'
import { hitSlopFor, iconSize, typography } from '@/constants/design'
import { useRadius } from '@/hooks/useRadius'

/** The preview affordance on an external top-track row, drawn small on purpose
 *  — it sits inside a row rather than beside one. `hitSlopFor` pads it out. */
const PREVIEW_BUTTON_SIZE = 28

export type TopTrackRowSong = Song | ExternalSong

/**
 * True when `song` came from an external catalog (Deezer/etc) rather than
 * the user's library — same discriminator as `SongRow`/`SongOptions`:
 * `ExternalSong.artist` is a plain string, a domain `Song`'s `artist` is
 * always an `ArtistRef` object.
 */
function isExternalTrack(song: TopTrackRowSong): song is ExternalSong {
  return typeof song.artist === 'string'
}

type Props = {
  song: TopTrackRowSong
  index: number
  artistName: string
  onPress?: () => void
}

function TopTrackRow({ song, index, artistName, onPress }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const rad = useRadius()
  const external = isExternalTrack(song)
  const duration = external ? formatSongDuration(song.duration) : formatDuration(song.durationSeconds)
  // Only an external (preview) track carries a 30s clip URL — a library song
  // is already fully playable, so it has nothing to preview and no button.
  const previewUrl = external ? song.previewUrl : undefined

  return (
    <MediaListRow
      title={song.title}
      subtitle={[artistName, duration].filter(Boolean).join(' • ')}
      cover={song.cover}
      onPress={onPress}
      variant="compact"
      leading={
        <Text style={[styles.trackIndex, { color: colors.subtext }]}>
          {index + 1}
        </Text>
      }
      trailing={
        previewUrl ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={t('a11y.topTrack.playPreview', { title: song.title })}
            style={[styles.previewButton, { backgroundColor: colors.card, borderRadius: rad.pillFor(PREVIEW_BUTTON_SIZE) }]}
            onPress={onPress}
            disabled={!onPress}
            hitSlop={hitSlopFor(iconSize.badge)}
          >
            <Play size={iconSize.badge} color={colors.secondary} fill={colors.secondary} />
          </Touchable>
        ) : undefined
      }
    />
  )
}

export default memo(TopTrackRow)

const styles = StyleSheet.create({
  trackIndex: {
    ...typography.caption,
    width: 16,
    textAlign: 'left',
  },
  previewButton: {
    width: PREVIEW_BUTTON_SIZE,
    height: PREVIEW_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
