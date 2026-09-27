import { coverFade, hitSlopFor, iconSize, onDark, shade, spacing, typography } from '@/constants/design';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Platform } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import TurboImage from 'react-native-turbo-image';
import { MediaImage } from '@/components/MediaImage';
import { buildCover } from '@/providers/registry/covers';
import { useTheme } from '@/features/theme/useTheme';
import { useScreenBackground } from '@/features/theme/screenBackgroundContext';
import {
  DetailHeaderBar,
  useDetailHeaderInset,
  useDetailHeroTitleLayout,
} from '@/components/DetailHeader';
import Touchable from '@/components/Touchable';
import { useRadius } from '@/features/theme/useRadius';
import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel';
import type { CoverSource } from '@/domain/entities/Cover';
import { useResolvedCover } from '@/features/artwork/useResolvedCover';
import { SOURCES } from '@/providers/registry/sources';
import ArtistMetaRow from './ArtistMetaRow';
import ExternalActionRow from './ExternalActionRow';
import LocalActionRow from './LocalActionRow';
import ArtistOptionsButton from './ArtistOptionsButton';

const NO_COVER: CoverSource = { kind: 'none' };

/**
 * The artist's photograph behind the header.
 *
 * Over the screen's own colour it is an opaque panel, as it has always been.
 * Over a background image it is masked out towards its foot instead, so the
 * page's image comes through it rather than starting where it stops — the
 * gradient above can only darken what is already there, and darkening to solid
 * is what put a line across the screen.
 *
 * The mask costs a native view, so it is only mounted when there is something
 * behind to reveal.
 */
const HeroBackdrop: React.FC<{ coverUri: string | null; muted: string; overImage: boolean }> = ({
  coverUri,
  muted,
  overImage,
}) => {
  if (!coverUri) {
    // Nothing to fade. Over a page image the muted slab is the same hard edge
    // the fade exists to avoid, so it simply steps aside.
    return overImage ? null : (
      <View testID="artist-hero-slab" style={[StyleSheet.absoluteFill, { backgroundColor: muted }]} />
    );
  }

  const photo = (
    <TurboImage
      testID="artist-hero-photo"
      source={{ uri: coverUri }}
      style={[StyleSheet.absoluteFill, { left: -50, right: -50 }]}
      resizeMode="cover"
      blur={Platform.OS === 'ios' ? 20 : 10}
      fadeDuration={300}
      cachePolicy="dataCache"
    />
  );

  if (!overImage) return photo;

  return (
    <MaskedView
      testID="artist-hero-mask"
      style={StyleSheet.absoluteFill}
      maskElement={
        <LinearGradient
          colors={[...coverFade.heroMask]}
          locations={[...coverFade.heroMaskStops]}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      {photo}
    </MaskedView>
  );
};

type Props = {
  model: ArtistScreenModel;
  showNavigation?: boolean;
};

const ArtistHeader: React.FC<Props> = ({ model, showNavigation = true }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { isDarkMode, colors } = useTheme();
  const rad = useRadius();
  // The bar floats over this art now, so the wrapper grows by exactly the room
  // it and the status bar take: the cover stays where it was against the
  // content below, and the extra strip is filled with art rather than a band.
  const barInset = useDetailHeaderInset();
  // Whether the page carries a background image. The header's own artwork has
  // to give way to it rather than close over it.
  const overImage = useScreenBackground() !== null;
  const onTitleLayout = useDetailHeroTitleLayout();

  const { artist, isLocal, counts } = model;
  const displayName = artist?.name ?? '';
  // The same rule as every tile: its own picture, the library's copy, then a
  // backup — and only a backup's picture is credited.
  const { cover: displayCover, from } = useResolvedCover(artist?.cover ?? NO_COVER);
  const enrichedArtworkSourceNameKey = from === 'own' || from === 'library' ? null : SOURCES[from].nameKey;

  const coverUri = buildCover(displayCover, 'background');

  return (
    <>
      <View style={[styles.heroBlock, { height: ARTIST_HERO_HEIGHT + barInset }]}>
        {/* Only the art is clipped. The picture overscans sideways and the
            mask needs a bound, but the round cover hangs below the hero on
            purpose — clipping both together is what flattened its foot. */}
        <View style={styles.fullBleedWrapper}>
          <HeroBackdrop
            coverUri={coverUri}
            muted={colors.muted}
            overImage={overImage}
          />

          <LinearGradient
            testID="artist-hero-fade"
            colors={
              overImage
                ? coverFade.onImage
                : isDarkMode
                  ? coverFade.onDark
                  : coverFade.onLight
            }
            locations={overImage ? [...coverFade.onImageStops] : undefined}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={[styles.centeredCoverContainer, { borderRadius: rad.pill }]}>
          <MediaImage
            cover={displayCover}
            size="detail"
            style={[styles.centeredCover, { borderRadius: rad.pill }]}
          />
        </View>

        {showNavigation && (
          <View style={styles.header}>
            <Touchable
              testID="detail-back-button"
              accessibilityRole="button"
              accessibilityLabel={t('a11y.common.back')}
              style={[styles.backButton, { borderRadius: rad.md }]}
              hitSlop={hitSlopFor(36)}
              onPress={() => navigation.goBack()}
            >
              <ChevronLeft size={iconSize.header} color={onDark.text} style={{ marginLeft: -2 }} />
            </Touchable>
            {artist ? (
              <ArtistOptionsButton artist={artist} />
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: spacing.lg }} onLayout={onTitleLayout}>
        <View style={styles.content}>
          <Text
            style={[styles.artistName, { color: colors.secondary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {displayName}
          </Text>
          <ArtistMetaRow isLocal={isLocal} counts={counts} />
          {enrichedArtworkSourceNameKey && (
            <Text style={[styles.artworkSourceLine, { color: colors.subtext }]}>
              {t('artist.enrichedArtworkSource', { source: t(enrichedArtworkSourceNameKey) })}
            </Text>
          )}
        </View>
      </View>

      {artist
        ? isLocal
          ? <LocalActionRow artist={artist} />
          : <ExternalActionRow artist={artist} />
        : null}
    </>
  );
};

export const ArtistHeaderBar: React.FC<Props> = ({ model }) => {
  const displayName = model.artist?.name ?? '';
  return (
    <DetailHeaderBar
      title={displayName}
      rightAction={model.artist ? <ArtistOptionsButton artist={model.artist} /> : undefined}
    />
  );
};

export default ArtistHeader;

/** The blurred cover behind an artist's name, before the floating bar's inset. */
const ARTIST_HERO_HEIGHT = 300;

/**
 * How far the round cover hangs below the hero.
 *
 * The content below clears it by this much on top of its own margin. It used
 * to clear nothing, because the hero clipped the overhang away and there was
 * nothing to clear — the cover was a circle with a flat foot and the name sat
 * where the rest of it should have been.
 */
const COVER_OVERHANG = 32;

const styles = StyleSheet.create({
  /** Lays out the hero and carries the round cover that overhangs its foot. */
  heroBlock: {
    width: '100%',
    height: ARTIST_HERO_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  /** The art alone, clipped to the hero. */
  fullBleedWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  centeredCoverContainer: {
    position: 'absolute',
    bottom: -COVER_OVERHANG,
    width: 120,
    height: 120,
    overflow: 'hidden',
    backgroundColor: onDark.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredCover: {
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 20 : 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    zIndex: 20,
  },
  backButton: {
    width: 36,
    height: 36,
    backgroundColor: shade.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    marginTop: spacing.lg + COVER_OVERHANG,
    marginBottom: spacing.lg,
  },
  artistName: {
    ...typography.display,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  artworkSourceLine: {
    ...typography.micro,
    marginTop: spacing.xxs,
  },
});
