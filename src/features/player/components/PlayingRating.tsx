import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';

import { iconSize, onDark, spacing } from '@/constants/design';
import type { Song } from '@/domain/entities/Song';
import StarRating from '@/features/ratings/StarRating';
import { useRating, useSetRating } from '@/features/ratings/useRatings';
import { useRatingsAvailable } from '@/features/ratings/useRatingsAvailable';
import { selectShowRating } from '@/features/settings/playback/state';

/**
 * Five stars under the title of the playing track.
 *
 * The surface the whole feature was asked for: rating what is playing without
 * opening anything. Drawn in the player's own two greys rather than the
 * theme's accent — the player's background is dark whatever the theme, and
 * the filled/empty pair here is the same one the progress bar uses, so the
 * stars read as part of the same control stack rather than as a badge.
 *
 * Renders nothing at all on a server without ratings, whatever the setting
 * says; a switch cannot turn on something the server cannot store.
 */
const PlayingRating: React.FC<{ song: Song }> = ({ song }) => {
  const available = useRatingsAvailable();
  const enabled = useSelector(selectShowRating);
  const rating = useRating(song);
  const setRating = useSetRating();

  const change = useCallback(
    (next: number) => { void setRating(song.nativeId, next); },
    [setRating, song.nativeId]
  );

  if (!available || !enabled) return null;

  return (
    <View style={styles.row}>
      <StarRating
        value={rating}
        onChange={change}
        color={onDark.text}
        emptyColor={onDark.mutedText}
        size={iconSize.control}
      />
    </View>
  );
};

export default PlayingRating;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
});
