import { DEFAULT_BACKGROUND_CROP, type ScreenBackgroundCrop } from './theme';

/**
 * Where a background photo is drawn, worked out rather than left to
 * `contentFit`.
 *
 * `contentFit="cover"` can fill a screen but only ever from the middle, and
 * `contentPosition` can slide that fill but not enlarge it — so neither alone
 * gives a zoom with something to pan along. Sizing and offsetting the photo
 * here does both, and does it in one place: the preview in Settings and the
 * background behind the app call this same function, so what the preview shows
 * is what the screen draws. A preview that computed its own crop would agree
 * until one of the two was edited.
 *
 * Deliberately a leaf with no React in it — the arithmetic is the part that can
 * be wrong, so it is the part that is tested.
 */

/** The most a photo can be enlarged past filling the screen. */
export const MAX_ZOOM = 4;

export type Size = { width: number; height: number };

/** Absolute placement for the photo inside the screen it fills. */
type BackgroundLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export const cropOrDefault = (crop?: ScreenBackgroundCrop): ScreenBackgroundCrop =>
  crop ?? DEFAULT_BACKGROUND_CROP;

/**
 * How much bigger than the container the photo is once it fills and zooms.
 *
 * Zero on an axis the photo already matches — there is nothing to pan along
 * one that fits exactly, which is why zooming in is what makes a square photo
 * on a tall screen draggable sideways at all.
 */
export function overflowFor(
  container: Size,
  image: Size,
  zoom: number,
): Size {
  if (!container.width || !container.height || !image.width || !image.height) {
    return { width: 0, height: 0 };
  }
  const fill = Math.max(container.width / image.width, container.height / image.height);
  const scale = fill * Math.max(zoom, 1);
  return {
    width: Math.max(image.width * scale - container.width, 0),
    height: Math.max(image.height * scale - container.height, 0),
  };
}

/**
 * Where to put the photo, or null while its size is still unknown.
 *
 * Null rather than a guess: the caller falls back to a centred `cover`, which
 * is what the app drew before any of this and is right until there is
 * something better to draw.
 */
export function layoutFor(
  container: Size,
  image: Size | null,
  crop?: ScreenBackgroundCrop,
): BackgroundLayout | null {
  if (!image || !image.width || !image.height) return null;
  if (!container.width || !container.height) return null;

  const { x, y, zoom } = cropOrDefault(crop);
  const overflow = overflowFor(container, image, zoom);

  return {
    // `|| 0` for the sign, not the value: an axis with no overflow multiplies
    // out to `-0`, which is equal to `0` everywhere but prints as `-0` and
    // would make an offset look meaningful when it is not.
    left: -(overflow.width * clamp01(x)) || 0,
    top: -(overflow.height * clamp01(y)) || 0,
    width: container.width + overflow.width,
    height: container.height + overflow.height,
  };
}

/**
 * The crop after dragging the photo by this many points.
 *
 * Dragging the photo right reveals what was off its left edge, so `x` falls as
 * `dx` rises. An axis with no overflow does not move: there is nothing hidden
 * to bring into view, and letting it drift would make the photo jump the
 * moment a zoom gave it room.
 */
export function panned(
  crop: ScreenBackgroundCrop,
  delta: { dx: number; dy: number },
  overflow: Size,
): ScreenBackgroundCrop {
  return {
    ...crop,
    x: overflow.width ? clamp01(crop.x - delta.dx / overflow.width) : crop.x,
    y: overflow.height ? clamp01(crop.y - delta.dy / overflow.height) : crop.y,
  };
}

/**
 * The crop at this zoom, held between filling the screen and {@link MAX_ZOOM}.
 *
 * The clamp lives here rather than in the slider's bounds so that a stored
 * value from somewhere else — an older build, a shared profile — is brought
 * into range on the way out instead of drawing a photo smaller than the screen.
 */
export function withZoom(crop: ScreenBackgroundCrop, zoom: number): ScreenBackgroundCrop {
  return { ...crop, zoom: zoom < 1 ? 1 : zoom > MAX_ZOOM ? MAX_ZOOM : zoom };
}

/** Whether this crop is the plain centred fill, so a Reset can hide itself. */
export function isDefaultCrop(crop?: ScreenBackgroundCrop): boolean {
  const c = cropOrDefault(crop);
  return c.x === DEFAULT_BACKGROUND_CROP.x
    && c.y === DEFAULT_BACKGROUND_CROP.y
    && c.zoom === DEFAULT_BACKGROUND_CROP.zoom;
}
