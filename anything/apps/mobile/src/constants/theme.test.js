// Token + motion-selector unit tests (ticket 2.77 — Liquid Glass foundation).
// Pixels/springs are device-judged, but the pure token shapes and the
// Reduce-Motion decision are unit-testable and worth pinning so a future edit
// can't silently drop a token or invert the accessibility fallback.

import {
  COLORS,
  SPACING,
  RADII,
  RADIUS,
  TYPE,
  ELEVATION,
  MATERIALS,
  BLUR,
  SPRINGS,
  DURATIONS,
  SCALE,
  selectByMotion,
} from "./theme";

describe("design tokens", () => {
  it("re-exports the existing palette unchanged (hues are not part of 2.77)", () => {
    // Spot-check the brand anchors that the ticket says must stay.
    expect(COLORS.coral).toBe("#FF6F61");
    expect(COLORS.cream).toBe("#FFF7EF");
    expect(COLORS.warmBrown).toBe("#3B241B");
  });

  it("exposes a monotonically increasing spacing scale", () => {
    const ordered = [
      SPACING.xs,
      SPACING.sm,
      SPACING.md,
      SPACING.lg,
      SPACING.xl,
      SPACING.xxl,
      SPACING.xxxl,
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
    }
  });

  it("provides radii + semantic radius roles", () => {
    expect(RADII.pill).toBeGreaterThan(RADII.xxl);
    expect(RADIUS.card).toBe(RADII.xl);
    expect(RADIUS.chip).toBe(RADII.pill);
  });

  it("every type token carries a size, line-height and weight", () => {
    for (const t of Object.values(TYPE)) {
      expect(typeof t.fontSize).toBe("number");
      expect(typeof t.lineHeight).toBe("number");
      expect(typeof t.fontWeight).toBe("string");
      // Line-height should never crush the glyph.
      expect(t.lineHeight).toBeGreaterThanOrEqual(t.fontSize);
    }
  });

  it("elevation levels grow softly and stay low-contrast", () => {
    expect(ELEVATION.none).toEqual({});
    expect(ELEVATION.sm.shadowOpacity).toBeLessThan(ELEVATION.md.shadowOpacity);
    expect(ELEVATION.md.shadowOpacity).toBeLessThan(ELEVATION.lg.shadowOpacity);
    // Lighter chrome: never a heavy drop shadow.
    expect(ELEVATION.lg.shadowOpacity).toBeLessThanOrEqual(0.2);
  });

  it("material tokens cover surface, glass, and a solid fallback", () => {
    expect(MATERIALS.surface).toBe(COLORS.card);
    expect(MATERIALS.solidFallback).toBe(COLORS.cream);
    // Glass tints are translucent (rgba with alpha < 1).
    expect(MATERIALS.glassTint).toMatch(/^rgba\(.*0?\.\d+\)$/);
    expect(BLUR.regular).toBeGreaterThan(BLUR.thin);
  });

  it("spring presets are valid reanimated configs", () => {
    for (const cfg of Object.values(SPRINGS)) {
      expect(cfg.mass).toBeGreaterThan(0);
      expect(cfg.damping).toBeGreaterThan(0);
      expect(cfg.stiffness).toBeGreaterThan(0);
    }
    expect(SCALE.pressed).toBeLessThan(1);
    expect(DURATIONS.fast).toBeLessThan(DURATIONS.base);
  });
});

describe("selectByMotion — Reduce-Motion selector", () => {
  it("returns the reduced variant when motion is minimized", () => {
    expect(selectByMotion(true, "spring", "fade")).toBe("fade");
  });

  it("returns the full variant when motion is allowed", () => {
    expect(selectByMotion(false, "spring", "fade")).toBe("spring");
  });
});
