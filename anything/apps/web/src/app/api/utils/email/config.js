// email/config — the transactional-email vendor keys, read at call time (never at import time,
// so tests can set/unset them per case exactly like the CRON_SECRET / VIDEO_API_KEY suites do).
//
// DORMANT BEHIND KEYS, same as payments / video / enrichment: with EMAIL_API_KEY unset the app
// still works end to end, it just doesn't put a message on the wire (the caller logs the intended
// send instead). Nothing throws, nothing 500s, no key ships to the client.
//
// EMAIL_PROVIDER selects the adapter. Only 'resend' exists today — chosen because its send API is
// a single authenticated JSON POST with no SDK, so the adapter is ~15 lines and swapping in
// Postmark/SES means adding one more branch in index.js, not touching any route.

export const DEFAULT_EMAIL_PROVIDER = "resend";

/**
 * Resolve the email config, or null when the feature is not set up yet.
 * @returns {{ provider: string, apiKey: string, from: string, baseUrl: string } | null}
 */
export function emailConfig() {
  const apiKey = process.env.EMAIL_API_KEY;
  if (!apiKey) return null;

  const provider = process.env.EMAIL_PROVIDER || DEFAULT_EMAIL_PROVIDER;
  return {
    provider,
    apiKey,
    // A verified sender on the vendor account. Falls back to a PawPi-domain address so a
    // half-configured deploy fails loudly at the vendor rather than silently sending as someone else.
    from: process.env.EMAIL_FROM || "PawPi <no-reply@pawpi.app>",
    baseUrl: process.env.EMAIL_API_BASE_URL || "https://api.resend.com",
  };
}
