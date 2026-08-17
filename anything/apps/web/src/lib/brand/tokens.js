// PawPi brand tokens — the single source for the public marketing/legal surface
// (homepage + /privacy /terms /eula /support). Mirrors pawpi-brand-kit/BRAND-GUIDELINES.md
// §4 Colour. Kept as a leaf module (no React/auth imports) so any page can pull it.
//
// Rules the palette encodes (enforce in components):
//   • cream page background, warm-brown text.
//   • coral is for BUTTONS / primary actions ONLY.
//   • links = underlined warm brown — coral text is ~2.5:1 and fails WCAG AA.
export const BRAND = {
  coral: "#FF6F61", // primary actions, buttons, expressive mark
  brown: "#3B241B", // default mark, all body + heading text
  cream: "#FFF7EF", // page background, reversed mark
  card: "#FFFCF8", // raised surfaces
  sand: "#F8EBDD", // quiet fills, eyebrow chips
  peach: "#FFD9B3", // accents, highlights
  muted: "#7A6254", // secondary text, captions, mono eyebrow
  border: "#F0E0D0", // hairlines + card borders
  white: "#FFFFFF",
};

export const FONT_SANS =
  '"Nunito", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

// The one verified, monitored mailbox (see src/constants/legal.js in mobile and
// docs/legal/*). NOT support@pawpi.info — that address is not provisioned, so it
// would be a dead App Store support contact.
export const SUPPORT_EMAIL = "augusto@pawpi.info";

// Canonical public origin (Railway custom domain). The brand Google Fonts
// (Nunito + JetBrains Mono) are injected client-side by useBrandFonts()
// (src/lib/legal/head.js) since this app doesn't wire route-module `links`.
export const SITE_URL = "https://pawpi.info";
