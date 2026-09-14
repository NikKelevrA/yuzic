import { motion, radius, spacing } from '@/constants/design';
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { usePlayingProgress } from '@/features/playback/PlayingContext';

type Props = {
  fallbackDuration: number;
  fillColor: string;
  trackColor: string;
};

/**
 * The playing bar's progress rule. Its own component so the once-a-second
 * progress tick re-renders this strip rather than the whole bar.
 */
function ProgressBarStrip({ fallbackDuration, fillColor, trackColor }: Props) {
  const { position, duration } = usePlayingProgress();
  const effectiveDuration = duration > 0 ? duration : fallbackDuration;
  const displayRatio = useSharedValue(0);

  useEffect(() => {
    const ratio = effectiveDuration > 0 ? Math.max(0, Math.min(1, position / effectiveDuration)) : 0;
    displayRatio.value = withTiming(ratio, { duration: motion.progress, easing: Easing.linear });
  }, [position, effectiveDuration, displayRatio]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${displayRatio.value * 100}%`,
  }));

  return (
    <View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.fill, fillStyle, { backgroundColor: fillColor }]} />
    </View>
  );
}

export default memo(ProgressBarStrip);

const styles = StyleSheet.create({
  track: {
    // Edge to edge: this is the rule between the now-playing row and the
    // tabs, so it cancels the bar's page padding rather than sitting inset
    // like a widget's own progress bar.
    height: 2,
    marginTop: spacing.sm,
    marginHorizontal: -spacing.page,
    borderRadius: radius.none,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
