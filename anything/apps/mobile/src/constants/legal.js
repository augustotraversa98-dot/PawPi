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
