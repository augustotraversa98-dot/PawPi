// Hosted legal URLs for the web app (Guideline 1.2 / App Store readiness). Mirrors the mobile
// constants/legal.js. CONFIG SLOTS — set the real published URLs via the NEXT_PUBLIC_* env vars
// (envPrefix is NEXT_PUBLIC_, so these are inlined into the client bundle by Vite). Until set, the
// signup "agree to" links degrade to plain bold text (no broken link), and the checkbox still gates.
export const TERMS_OF_SERVICE_URL = process.env.NEXT_PUBLIC_TERMS_URL || "";
export const PRIVACY_POLICY_URL = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL || "";

// Consent versions recorded at signup (POST /api/legal/consent -> legal_consents). These are
// SERVER-AUTHORITATIVE: the endpoint stamps these strings, never values from the client. Keep each
// equal to the "Last updated" date of the served document (src/content/legal/{terms,privacy}.*.md,
// mirrored in docs/legal/) and bump both together when a document materially changes.
// WHAT A BUMP DOES (verified 2026-10-16): it only changes the version stamped on NEW signups' consent
// rows. Nothing in the app or API compares a user's stored version to these constants, so existing
// users are NOT re-prompted. A re-consent-on-version-change backstop does not exist yet.
export const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2026-10-16";
export const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION || "2026-10-16";
