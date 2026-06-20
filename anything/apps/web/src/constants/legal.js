// Hosted legal URLs for the web app (Guideline 1.2 / App Store readiness). Mirrors the mobile
// constants/legal.js. CONFIG SLOTS — set the real published URLs via the NEXT_PUBLIC_* env vars
// (envPrefix is NEXT_PUBLIC_, so these are inlined into the client bundle by Vite). Until set, the
// signup "agree to" links degrade to plain bold text (no broken link), and the checkbox still gates.
export const TERMS_OF_SERVICE_URL = process.env.NEXT_PUBLIC_TERMS_URL || "";
export const PRIVACY_POLICY_URL = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL || "";
