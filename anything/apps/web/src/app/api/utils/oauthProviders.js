// oauthProviders — additive, ENV-GATED social sign-in providers (ticket 2.46).
//
// HIGH BLAST RADIUS (auth): this module NEVER touches the Credentials path or the adapter.
// It only returns EXTRA @auth/core providers, and ONLY for the ones whose env keys are
// present. If no social keys are set, it returns [] and login behaves exactly as before —
// so an install without keys can never lock anyone out.
//
// Env (set by Tats when the Apple Service ID / Google OAuth client are created — see
// .env.example + test-backlog ACTION 2):
//   Google → AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET
//   Apple  → AUTH_APPLE_ID + AUTH_APPLE_SECRET (Apple's "client secret" is a generated JWT)
//
// Callback URLs (register these with the provider):
//   <origin>/api/auth/callback/google
//   <origin>/api/auth/callback/apple
//
// New OAuth users: the @auth/core database adapter auto-creates auth_users + auth_accounts
// on first sign-in; the user_profiles row is then created lazily on the first authenticated
// API call (ensureUserProfile / the pets + user-profile routes), identical to a fresh
// credentials user — so no extra wiring is needed here.

import Google from "@auth/core/providers/google";
import Apple from "@auth/core/providers/apple";

// Returns the list of enabled social providers given an env bag (defaults to process.env).
// Pure + synchronous (no network): provider factories just return config objects.
export function socialProviders(env = process.env) {
  const providers = [];

  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (env.AUTH_APPLE_ID && env.AUTH_APPLE_SECRET) {
    providers.push(
      Apple({
        clientId: env.AUTH_APPLE_ID,
        clientSecret: env.AUTH_APPLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  return providers;
}

// The ids of the enabled social providers — handy for the UI / a quick gate check without
// constructing the provider objects. Mirrors the gating in socialProviders exactly.
export function enabledSocialProviderIds(env = process.env) {
  const ids = [];
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) ids.push("google");
  if (env.AUTH_APPLE_ID && env.AUTH_APPLE_SECRET) ids.push("apple");
  return ids;
}
