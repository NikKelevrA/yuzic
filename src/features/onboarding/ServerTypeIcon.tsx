import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { ServerProviderIcon } from '@/providers/registry/serverConnections';

/**
 * A server type's mark: its brand logo where it has one, a glyph from the
 * app's icon library where it does not (local files have no brand to show).
 */
export default function ServerTypeIcon({
  icon,
  size,
  color,
  style,
}: {
  icon: ServerProviderIcon | undefined;
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {icon?.kind === 'glyph' ? (
        <icon.Glyph size={size} color={color} />
      ) : icon?.kind === 'image' ? (
        <Image
          source={icon.source}
          style={{ width: size, height: size }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  );
}
