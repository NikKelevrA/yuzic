import React, { useEffect, useMemo, useState } from 'react';
import { View, Image } from 'react-native';
import TurboImage from 'react-native-turbo-image';
import { useSelector } from 'react-redux';
import { buildCover, buildCoverCacheKey, DRAWN_COVER } from '@/providers/registry/covers';
import { CoverSource } from '@/domain/entities/Cover';
import ThemedHeartCover from '@/components/ThemedHeartCover';
import ThemedRadioCover from '@/components/ThemedRadioCover';
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import { useTheme } from '@/features/theme/useTheme';
import { useResolvedCover } from '@/features/artwork/useResolvedCover';
import {
  hasImageUrlFailed,
  IMAGE_CACHE_POLICY,
  markImageUrlFailed,
  markImageUrlSucceeded,
} from '@/features/artwork/imageCache';

const placeholder = require('@assets/images/placeholder.png');

export function MediaImage({
  cover,
  size,
  style,
}: {
  cover: CoverSource;
  size: 'thumb' | 'grid' | 'detail' | 'background';
  style?: any;
}) {
  // Subscribe so we re-render when active server becomes available or changes.
  // buildCover() reads from the store; without this, URLs stay null until
  // some other state (e.g. list data) causes a re-render.
  const activeServerId = useSelector(selectActiveServerId);
  const { colors } = useTheme();
  // A gap is filled here the same way everywhere: the library's copy, then
  // the artwork backups the user has switched on. Asking a backup starts here.
  const { cover: resolved } = useResolvedCover(cover);
  const uri = useMemo(() => {
    void activeServerId;
    return buildCover(resolved, size);
  }, [resolved, size, activeServerId]);
  const cacheKey = useMemo(() => {
    void activeServerId;
    return buildCoverCacheKey(resolved, size);
  }, [resolved, size, activeServerId]);
  const [failedVersion, setFailedVersion] = useState(0);
  const primaryFailed = hasImageUrlFailed(uri);
  const sourceUri = useMemo(() => {
    void failedVersion;
    return uri && !primaryFailed ? uri : null;
  }, [failedVersion, primaryFailed, uri]);

  useEffect(() => {
    setFailedVersion(version => version + 1);
  }, [uri]);

  if (uri === DRAWN_COVER.heart) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <ThemedHeartCover />
      </View>
    );
  }

  if (uri === DRAWN_COVER.radio) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <ThemedRadioCover />
      </View>
    );
  }

  if (!sourceUri) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <Image
          source={placeholder}
          style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: colors.card }}
          resizeMode="cover"
        />
      </View>
    );
  }

  // Loading is not the same state as "there is no artwork", and it should not
  // look like it. The placeholder art is a picture-with-a-slash glyph — the
  // universal sign for a broken image — and sitting it behind every cover
  // meant a slow grid read as nine failures for the second or two before the
  // covers faded in. Behind a load in progress goes a plain surface instead;
  // the glyph is kept for the branch above, where there really is nothing.
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: colors.card }]}>
      <TurboImage
        source={{ uri: sourceUri, cacheKey: cacheKey ?? sourceUri }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
        cachePolicy={IMAGE_CACHE_POLICY}
        fadeDuration={200}
        onSuccess={() => {
          markImageUrlSucceeded(sourceUri);
        }}
        onFailure={() => {
          markImageUrlFailed(sourceUri);
          setFailedVersion(version => version + 1);
        }}
      />
    </View>
  );
}
