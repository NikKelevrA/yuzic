import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import { spacing, typography } from '@/constants/design';
import { BackgroundPhoto } from '@/features/theme/BackgroundPhoto';
import {
  cropOrDefault,
  overflowFor,
  panned,
  type Size,
} from '@/features/theme/backgroundCrop';
import type { ScreenBackgroundCrop } from '@/features/theme/theme';
import { useRadius } from '@/features/theme/useRadius';
import { useTheme } from '@/features/theme/useTheme';

/** How tall the preview stands. Its width follows the screen's shape. */
const PREVIEW_HEIGHT = 300;

/**
 * The photo as the app will draw it, with the part on show chosen by dragging.
 *
 * Shaped like the screen rather than like the photo, and drawn through the
 * same {@link BackgroundPhoto} the app draws, blur and veil included: the
 * point is not to show the picture but to show the wallpaper, and those are
 * different pictures once a blur and a 60% veil are involved.
 *
 * It is also the only place the Background page shows what any of its settings
 * do. Choosing a scope from a settings screen takes the photo off the screen
 * you are standing on, which reads as the setting having failed; a preview
 * that keeps drawing gives the page something to answer with.
 */
export const BackgroundCropEditor: React.FC<{
  uri: string;
  blur: number;
  dim: number;
  crop?: ScreenBackgroundCrop;
  /** Called once a drag ends, so a drag is one edit rather than sixty. */
  onChange: (crop: ScreenBackgroundCrop) => void;
}> = ({ uri, blur, dim, crop, onChange }) => {
  const { t } = useTranslation();
  const { colors, palette } = useTheme();
  const rad = useRadius();
  const window = useWindowDimensions();

  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const [photo, setPhoto] = useState<Size | null>(null);

  const current = cropOrDefault(crop);
  const overflow = photo ? overflowFor(container, photo, current.zoom) : { width: 0, height: 0 };

  // The gesture runs on the UI thread and cannot read state, so what it needs
  // to clamp against is mirrored into shared values.
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const limits = useSharedValue({ x: 0, y: 0, overflowW: 0, overflowH: 0 });

  useEffect(() => {
    limits.value = {
      x: current.x,
      y: current.y,
      overflowW: overflow.width,
      overflowH: overflow.height,
    };
  }, [current.x, current.y, overflow.width, overflow.height, limits]);

  // The crop as last committed, so a drag that lands reads the value it
  // started from rather than one a re-render may not have delivered yet.
  const committed = useRef(current);
  committed.current = current;

  const commit = useCallback((dx: number, dy: number) => {
    const next = panned(
      committed.current,
      { dx, dy },
      { width: limits.value.overflowW, height: limits.value.overflowH },
    );
    if (next.x !== committed.current.x || next.y !== committed.current.y) onChange(next);
  }, [onChange, limits]);

  const drag = Gesture.Pan()
    .onUpdate(event => {
      'worklet';
      const { x, y, overflowW, overflowH } = limits.value;
      // Held inside the photo's own edges, so a drag can never expose the
      // page behind it — the crop is clamped when it lands, and the preview
      // has to agree with that on the way.
      const maxRight = overflowW * x;
      const maxLeft = -overflowW * (1 - x);
      const maxDown = overflowH * y;
      const maxUp = -overflowH * (1 - y);
      tx.value = Math.min(Math.max(event.translationX, maxLeft), maxRight);
      ty.value = Math.min(Math.max(event.translationY, maxUp), maxDown);
    })
    // `onFinalize`, not `onEnd`: a gesture cancelled part way still has to put
    // the offset back, or the photo stays shifted with nothing to commit it.
    .onFinalize(() => {
      'worklet';
      runOnJS(commit)(tx.value, ty.value);
      tx.value = 0;
      ty.value = 0;
    });

  const shift = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  const canPan = overflow.width > 0 || overflow.height > 0;

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={drag}>
        <View
          testID="background-crop-preview"
          style={[
            styles.frame,
            {
              // The screen's own shape, so the preview crops where it will.
              width: PREVIEW_HEIGHT * (window.width / window.height),
              height: PREVIEW_HEIGHT,
              borderRadius: rad.panel,
              borderColor: colors.border,
              backgroundColor: colors.muted,
            },
          ]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, shift]}>
            <BackgroundPhoto
              style={StyleSheet.absoluteFill}
              uri={uri}
              blur={blur}
              dim={dim}
              // `palette`, not `colors`: the page colour is reported
              // transparent while a background image is showing, and a veil
              // that takes it does not veil. The preview would then show the
              // photo brighter than the app ever draws it.
              veilColor={palette.background}
              crop={crop}
              onContainerSize={setContainer}
              onPhotoSize={setPhoto}
            />
          </Animated.View>
        </View>
      </GestureDetector>

      <Text style={[styles.hint, { color: colors.subtext }]}>
        {t(canPan ? 'settings.appearance.background.dragHint' : 'settings.appearance.background.zoomHint')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  frame: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    ...typography.micro,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
