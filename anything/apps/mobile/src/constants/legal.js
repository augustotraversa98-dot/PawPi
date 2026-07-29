// Legal URLs (App Store readiness, ticket 2.78). Apple requires a reachable Privacy Policy URL (App
// Store Connect metadata + in-app) and a Terms link before submission. These are CONFIG SLOTS — set
// the real published URLs here (or via the EXPO_PUBLIC_* env vars) before submitting. Until then the
// in-app links degrade cleanly (the "agree to" line shows as plain text, no broken link).
//
// ⚠️ Tats: supply the real hosted Privacy Policy + Terms of Service URLs (see docs/app-store-readiness.md).
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || "";
export const TERMS_OF_SERVICE_URL =
  process.env.EXPO_PUBLIC_TERMS_URL || "";

export const hasLegalUrls = () =>
  Boolean(PRIVACY_POLICY_URL) || Boolean(TERMS_OF_SERVICE_URL);

// Support contact (Guideline 1.2 / App Store "Support URL"). The email always resolves (default
// below) so "Contact Us" is never dead; the Help Center URL is optional and falls back to email.
//
// The default is a REAL, MONITORED mailbox. It used to be support@pawpi.app — a domain PawPi does
// not own, so every "Contact Us" tap opened a message that could never be delivered or bounced.
// PawPi owns **pawpi.info** and has exactly one mailbox on it, which is also the address published
// in docs/legal/support.md and the App Store Connect content pack. Keep those three in step: the
// ASC "Support URL"/contact must match whatever this resolves to.
export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "augusto@pawpi.info";
export const HELP_CENTER_URL = process.env.EXPO_PUBLIC_HELP_URL || "";
