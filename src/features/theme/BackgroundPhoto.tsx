import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';

import { layoutFor, type Size } from './backgroundCrop';
import type { ScreenBackgroundCrop } from './theme';

/**
 * A background photo, cropped, blurred and veiled — the whole look in one
 * place.
 *
 * Both the screen background and the preview in Settings draw through this, so
 * "what you see is what you get" is a property of there being one component
 * rather than of two of them being kept in step. The preview passes its own
 * box; the background passes the screen.
 *
 * The photo's own pixel size has to be known before a crop can be placed, and
 * it arrives with the first load rather than with the props. Until it does,
 * the photo is drawn as a centred fill — exactly what the app drew before
 * crops existed, so the fallback is a previous version of this feature rather
 * than a blank frame.
 */
export const BackgroundPhoto: React.FC<{
  uri: string;
  blur: number;
  /** How much of `veilColor` is laid over the photo, 0 to 1. */
  dim: number;
  veilColor: string;
  crop?: ScreenBackgroundCrop;
  /** Told the box's size as it is measured, for callers that pan it. */
  onContainerSize?: (size: Size) => void;
  /** Told the photo's own size once known, for the same reason. */
  onPhotoSize?: (size: Size) => void;
  style?: object;
  testID?: string;
}> = ({ uri, blur, dim, veilColor, crop, onContainerSize, onPhotoSize, style, testID }) => {
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const [photo, setPhoto] = useState<Size | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainer({ width, height });
    onContainerSize?.({ width, height });
  };

  const placed = layoutFor(container, photo, crop);

  return (
    <View style={[styles.clip, style]} onLayout={onLayout} testID={testID}>
      <Image
        testID={testID ? `${testID}-photo` : undefined}
        source={{ uri }}
        // Placed by hand once the photo's size is known; `cover` centres it
        // until then, which is the crop this feature defaults to anyway.
        style={placed ? { position: 'absolute', ...placed } : StyleSheet.absoluteFill}
        contentFit={placed ? 'fill' : 'cover'}
        blurRadius={blur}
        transition={300}
        onLoad={event => {
          const { width, height } = event.source ?? {};
          if (!width || !height) return;
          setPhoto({ width, height });
          onPhotoSize?.({ width, height });
        }}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: veilColor, opacity: dim }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  // The photo is sized past the box on the axis it is cropped along, so the
  // box has to hold it in.
  clip: { overflow: 'hidden' },
});
