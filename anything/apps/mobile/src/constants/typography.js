// Type scale (ticket 2.77 — Liquid Glass foundation).
// Named text styles modelled on the iOS system type scale (size + line-height +
// weight + tracking) so restyled screens share one refined, consistent scale
// instead of ad-hoc font sizes. Spread a token into a Text style:
//   <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>…</Text>
// Color is intentionally NOT baked in — the warm palette (COLORS) still wins.

export const TYPE = {
  largeTitle: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.4 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.3 },
  title2: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.2 },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: "700", letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "500" },
  callout: { fontSize: 14, lineHeight: 21, fontWeight: "500" },
  subhead: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  footnote: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0.2 },
  // All-caps section label (e.g. the Feed "PET FRIENDS' MOMENTS" divider).
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "800", letterSpacing: 0.7 },
};

// Common font weights as named constants (avoids stringly-typed "800" sprinkled
// around). React Native expects these as strings.
export const WEIGHT = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
};
