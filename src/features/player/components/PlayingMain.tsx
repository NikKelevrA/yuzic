import { hitSlopFor, iconSize, motion, onDark, spacing, typography } from '@/constants/design';
import React, { memo, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useAnimatedReaction, runOnJS, withSpring, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';

import {
  usePlayingState,
  usePlayingProgress,
  usePlayingActions,
  usePlayingQueueVersion,
} from '@/features/playback/PlayingContext';
import { coverNeighbours } from '../coverNeighbours';
import type { CoverStrip } from '@/features/player/PlayerExpansion';
import { SeekableProgressBar } from './SeekableProgressBar';
import { useSelector } from 'react-redux';
import { selectShowQualityBadge } from '@/features/settings/appearance/state';
import { hasDuration } from '@/domain/playback/ContentKind';
import { CirclePlus } from 'lucide-react-native';
import { usePlayerExpansion } from '@/features/player/PlayerExpansion';
import { resolveCoverSwipe } from '../coverSwipe';
import { canStartCoverSlide } from '../coverTransition';
import Touchable from '@/components/Touchable';
import { useRadius } from '@/features/theme/useRadius';

type PlayingMainProps = {
  width: number;
  onPressArtist?: () => void;
  onPressOptions?: () => void;
  onPressAdd?: () => void;
};

// A swipe is unreachable with a screen reader on, so the same two outcomes are
// offered as named actions. `increment`/`decrement` are what an `adjustable`
// role advertises, which is how VoiceOver and TalkBack already expect to move
// through a value.
const SWIPE_A11Y_ACTIONS = [
  { name: 'increment' as const },
  { name: 'decrement' as const },
];

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Isolated so the once-a-second progress tick only re-renders the seek bar
// and timestamps, not the cover art / title / artist / add button above it —
// same reasoning as ProgressBarStrip in the mini player (PlayingBarBase).
const PlayingProgressSection: React.FC<{ songDuration: number }> = memo(({ songDuration }) => {
  const { seekSong } = usePlayingActions();
  const progress = usePlayingProgress();
  const nativeDuration = progress.duration;
  const duration = nativeDuration > 0 ? nativeDuration : songDuration;
  const position = Math.min(progress.position, duration);

  return (
    <>
      <SeekableProgressBar
        value={position}
        duration={duration}
        onSeek={seekSong}
        fillColor={onDark.text}
        trackColor={onDark.mutedText}
        style={styles.progressBar}
      />

      <View style={styles.timestamps}>
        <Text style={styles.timestamp}>
          {formatTime(position)}
        </Text>
        <Text style={styles.timestamp}>
          -{formatTime(duration - position)}
        </Text>
      </View>
    </>
  );
});
PlayingProgressSection.displayName = 'PlayingProgressSection';

const PlayingMain: React.FC<PlayingMainProps> = ({
  width,
  onPressArtist,
  onPressOptions,
  onPressAdd
}) => {
  const { t } = useTranslation();
  const { currentSong, currentIndex, repeatMode } = usePlayingState();
  const { skipToNext, skipToPrevious, getQueue } = usePlayingActions();
  const currentSongId = currentSong?.localId;
  const currentCover = currentSong?.cover ?? null;
  const queueLength = getQueue().length;
  const queueVersion = usePlayingQueueVersion();
  // How far the row travels to bring a neighbour in. A window width, not a
  // cover width: the cover is inset from the screen edges, so that is where
  // the host rests the next one — and a shorter travel would land it beside
  // the slot rather than in it.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const rad = useRadius();

  // Handed to the host as the swipe is accepted, so the row it is drawing is
  // held still while the skip commits: the queue moves the instant playback
  // takes the command, and re-deriving it mid-flight would change the picture
  // under the finger.
  const strip = useMemo<CoverStrip>(
    () => ({ current: currentCover, ...coverNeighbours(getQueue(), currentIndex, repeatMode) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `queueVersion` is what says the queue changed
    [currentCover, currentIndex, repeatMode, getQueue, queueVersion],
  );
  const showQualityBadge = useSelector(selectShowQualityBadge);
  const { expansion, fullCover, scrollY, coverSwipeX, beginCoverSlide } = usePlayerExpansion();

  // The cover itself is drawn by the player host, one layer up, so a single
  // image can travel between here and the playing bar instead of one being
  // swapped for another. What is left here is the hole it lands in, and the
  // job of telling the host where that hole is.
  const coverSlotRef = useRef<View>(null);
  const measureCoverSlot = useCallback(() => {
    coverSlotRef.current?.measureInWindow((x, y, slotWidth) => {
      if (slotWidth <= 0) return;
      // `measureInWindow` reports where the slot is *right now*, and right now
      // the player's surface is usually somewhere it will not stay: it is
      // translated down by a whole screen height while closed, and the list
      // under it may be scrolled. Taken raw, a measurement made at any moment
      // but a settled, unscrolled open stored a slot roughly one screen below
      // where the cover would be drawn — so the artwork flew off the screen
      // and only snapped into place once the player landed and re-measured.
      // That is the first open of a session, which never had a corrected rect
      // to use, and it is why every later open looked right.
      //
      // Undo both, so the rect always means "where the slot sits when the
      // player is open and unscrolled" no matter when it was taken.
      const surfaceOffset = (1 - expansion.value) * windowHeight;
      fullCover.value = { x, y: y - surfaceOffset + scrollY.value, size: slotWidth };
    });
  }, [fullCover, expansion, scrollY, windowHeight]);

  // Re-measure when the player comes to rest at either end: the lyrics preview
  // and the optional cards arrive after the first layout and can move this.
  // Safe at both ends now that the measurement undoes the surface offset
  // itself — before that, measuring while closed stored a slot a screen too
  // low and broke the very next open.
  useAnimatedReaction(
    () => expansion.value >= 1 || expansion.value <= 0.001,
    (atRest, wasAtRest) => {
      if (atRest && atRest !== wasAtRest) runOnJS(measureCoverSlot)();
    },
    [measureCoverSlot],
  );

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'increment') void skipToNext();
      else if (event.nativeEvent.actionName === 'decrement') void skipToPrevious();
    },
    [skipToNext, skipToPrevious],
  );

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        // Horizontal only. The player's own drag-to-close pan and the scroll
        // view underneath both want vertical movement, so this one refuses it
        // outright rather than racing them for it: without the Y limit a
        // diagonal drag can start a skip and close the player at once.
        .activeOffsetX([-12, 12])
        .failOffsetY([-14, 14])
        .onUpdate(event => {
          coverSwipeX.value = event.translationX;
        })
        .onEnd(event => {
          const outcome = resolveCoverSwipe(event.translationX, event.velocityX, width);
          if (
            !currentSongId || outcome === 'cancel' ||
            !canStartCoverSlide(outcome, currentIndex, queueLength, repeatMode)
          ) {
            coverSwipeX.value = withSpring(0, { damping: 18, stiffness: 220 });
            return;
          }
          // Freeze the row first, then carry it exactly one cover across, so
          // the neighbour the finger already pulled into view is the one that
          // lands. The skip follows the animation rather than racing it: the
          // queue moving mid-slide is what made the old implementation recoil
          // instead of reading as a carousel.
          runOnJS(beginCoverSlide)(outcome, currentSongId, strip);
          coverSwipeX.value = withTiming(
            outcome === 'next' ? -windowWidth : windowWidth,
            { duration: motion.swipe },
            finished => {
              if (finished) runOnJS(outcome === 'next' ? skipToNext : skipToPrevious)();
            },
          );
        }),
    [
      beginCoverSlide, coverSwipeX, strip, currentIndex, currentSongId,
      queueLength, repeatMode, skipToNext, skipToPrevious, width, windowWidth,
    ],
  );

  if (!currentSong) {
    return null;
  }
  const qualityLabel = (() => {
    const parts: string[] = [];
    const audio = currentSong.audio;
    if (audio?.mimeType) {
      const fmt = audio.mimeType.split('/')[1]?.toUpperCase().replace('MPEG', 'MP3').replace('X-FLAC', 'FLAC') ?? '';
      if (fmt) parts.push(fmt);
    }
    if (audio?.bitrateKbps) parts.push(`${audio.bitrateKbps}kbps`);
    else if (audio?.sampleRateHz) parts.push(`${(audio.sampleRateHz / 1000).toFixed(1)}kHz`);
    return parts.join(' · ') || null;
  })();

  return (
    <View style={[styles.root, { width }]}>
      <GestureDetector gesture={swipe}>
        <View
          ref={coverSlotRef}
          onLayout={measureCoverSlot}
          // Keeps its surface colour rather than going transparent: the
          // travelling cover lands exactly on top of it, and a song whose
          // artwork will not load still has the plain square it always had
          // instead of a hole where the cover should be.
          style={[styles.cover, { width, height: width, borderRadius: rad.card }]}
          // The square is what the finger swipes, but the cover the eye
          // follows is drawn by the host with pointerEvents="none" — so this
          // is also what a screen reader finds. Name it for what it does.
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('a11y.player.coverArt')}
          accessibilityActions={SWIPE_A11Y_ACTIONS}
          onAccessibilityAction={handleAccessibilityAction}
        />
      </GestureDetector>

      <View style={styles.titleRow}>
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {currentSong.title}
          </Text>

          {currentSong.artist.name && (
            <Touchable
              accessibilityRole="link"
              accessibilityHint={t('a11y.player.goToArtist')}
              onPress={onPressArtist}
            >
              <Text style={styles.artist} numberOfLines={1}>
                {currentSong.artist.name}
              </Text>
            </Touchable>
          )}
        </View>

        <View>
          <Touchable
          accessibilityRole="button"
          accessibilityLabel={t('a11y.player.addToPlaylist')}
          onPress={onPressAdd}
          style={styles.optionsButton}
          hitSlop={hitSlopFor(iconSize.large)}
        >
          <CirclePlus
            size={iconSize.large}
            color={onDark.text}
          />
        </Touchable>
        </View>
      </View>

      {showQualityBadge && qualityLabel && (
        <Text style={styles.qualityBadge} numberOfLines={1}>
          {qualityLabel}
        </Text>
      )}

      {/* Progress + timestamps only make sense for a finite piece of audio.
       * A radio station's position is meaningless, and the "-0:00 remaining"
       * label under an infinite stream reads as broken. */}
      {hasDuration(currentSong.contentKind) && (
        <PlayingProgressSection songDuration={currentSong.durationSeconds} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
  },
  cover: {
    marginBottom: spacing.lg,
    backgroundColor: onDark.surface,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: {
    ...typography.sectionTitle,
    color: onDark.text,
    marginBottom: spacing.xs,
  },
  artist: {
    ...typography.rowSubtitle,
    color: onDark.subtext,
  },
  qualityBadge: {
    ...typography.micro,
    color: onDark.mutedText,
    textAlign: 'left',
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  optionsButton: {
    padding: spacing.tight,
  },
  progressBar: {
    marginTop: spacing.sm,
  },
  timestamps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.controlGap,
  },
  timestamp: {
    ...typography.caption,
    color: onDark.subtext,
  },
});

export default PlayingMain;
