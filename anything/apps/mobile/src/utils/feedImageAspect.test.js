import {
  clampFeedAspectRatio,
  feedImageHeight,
  FEED_MIN_RATIO,
  FEED_MAX_RATIO,
} from "./feedImageAspect";

describe("clampFeedAspectRatio", () => {
  it("keeps an in-range portrait ratio untouched (4:5)", () => {
    expect(clampFeedAspectRatio(0.8)).toBeCloseTo(0.8);
  });

  it("keeps a square ratio untouched (1:1)", () => {
    expect(clampFeedAspectRatio(1)).toBe(1);
  });

  it("clamps a landscape image down to square (1:1)", () => {
    expect(clampFeedAspectRatio(1.78)).toBe(FEED_MAX_RATIO);
  });

  it("clamps a very tall portrait up to the 4:5 cap", () => {
    expect(clampFeedAspectRatio(0.5)).toBe(FEED_MIN_RATIO);
  });

  it("falls back to square for a missing/degenerate ratio", () => {
    expect(clampFeedAspectRatio(undefined)).toBe(FEED_MAX_RATIO);
    expect(clampFeedAspectRatio(0)).toBe(FEED_MAX_RATIO);
    expect(clampFeedAspectRatio(-3)).toBe(FEED_MAX_RATIO);
    expect(clampFeedAspectRatio(NaN)).toBe(FEED_MAX_RATIO);
  });
});

describe("feedImageHeight", () => {
  it("renders a square image at width == height", () => {
    expect(feedImageHeight(300, 1)).toBe(300);
  });

  it("renders a 4:5 portrait taller than it is wide (1.25x)", () => {
    expect(feedImageHeight(300, 0.8)).toBe(375);
  });

  it("caps a very tall portrait at the 4:5 height (never taller)", () => {
    expect(feedImageHeight(300, 0.4)).toBe(375);
  });

  it("caps a landscape image at a square (never shorter than the width)", () => {
    expect(feedImageHeight(300, 2)).toBe(300);
  });

  it("returns undefined for a non-positive width", () => {
    expect(feedImageHeight(0, 1)).toBeUndefined();
    expect(feedImageHeight(undefined, 1)).toBeUndefined();
  });
});
