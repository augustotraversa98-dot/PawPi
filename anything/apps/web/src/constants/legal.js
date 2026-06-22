// Hosted legal URLs for the web app (Guideline 1.2 / App Store readiness). Mirrors the mobile
// constants/legal.js. CONFIG SLOTS — set the real published URLs via the NEXT_PUBLIC_* env vars
// (envPrefix is NEXT_PUBLIC_, so these are inlined into the client bundle by Vite). Until set, the
// signup "agree to" links degrade to plain bold text (no broken link), and the checkbox still gates.
export const TERMS_OF_SERVICE_URL = process.env.NEXT_PUBLIC_TERMS_URL || "";
export const PRIVACY_POLICY_URL = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL || "";

// Consent versions recorded at signup (POST /api/legal/consent → legal_consents). These are
// SERVER-AUTHORITATIVE: the endpoint stamps these strings, never values from the client. Date
// strings that match the "Last updated" date in docs/legal/*.md — bump BOTH the doc date and the
// matching constant together when either document materially changes (a version bump is what the
// future "re-consent on version change" backstop ticket keys off).
export const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2026-06-22";
export const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION || "2026-06-22";
