// Instagram-style feed image sizing (feed polish #1/#3).
//
// Feed photos render at the card's full content width and take their height from
// the image's natural aspect ratio, clamped to a pleasant range so a post reads
// like an IG post (never a tiny forced square, never a cropped-on-the-right box).
//
// Ratio here is width / height:
//   • 1.0 = square (1:1)          — the WIDE end of the allowed range
//   • 0.8 = portrait 4:5          — the TALL end (the portrait cap)
// Anything wider than square (landscape) clamps to 1:1; anything taller than 4:5
// clamps to 4:5. In-range images render fully (the box matches the image), so
// `contentFit: "cover"` only ever crops the small amount pushed outside the range.

export const FEED_MIN_RATIO = 0.8; // 4:5 portrait cap (width / height)
export const FEED_MAX_RATIO = 1.0; // 1:1 square

// Clamp a natural width/height ratio into the allowed feed range. Falls back to a
// square for a missing/degenerate ratio (e.g. before the image has loaded).
export function clampFeedAspectRatio(
  ratio,
  min = FEED_MIN_RATIO,
  max = FEED_MAX_RATIO,
) {
  if (!Number.isFinite(ratio) || ratio <= 0) return max;
  return Math.min(max, Math.max(min, ratio));
}

// Displayed pixel height for a feed image given the content width and the image's
// natural width/height ratio. Returns undefined for a non-positive width so a
// caller can fall back to its own layout.
export function feedImageHeight(width, ratio, min, max) {
  if (!Number.isFinite(width) || width <= 0) return undefined;
  return Math.round(width / clampFeedAspectRatio(ratio, min, max));
}
