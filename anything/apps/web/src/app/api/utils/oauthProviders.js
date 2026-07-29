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
//   Apple  → AUTH_APPLE_ID, plus EITHER:
//              - AUTH_APPLE_TEAM_ID + AUTH_APPLE_KEY_ID + AUTH_APPLE_PRIVATE_KEY (preferred —
//                the raw key material from the Apple Developer portal; the client-secret JWT
//                is generated fresh on every call via buildAppleClientSecret below, so it can
//                never silently expire the way a hand-pasted static JWT would within Apple's
//                ~6-month cap), OR
//              - AUTH_APPLE_SECRET, a pre-built static JWT (legacy path, kept for anyone who
//                already generated one by hand — still works exactly as before).
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
import { buildAppleClientSecret } from "./appleClientSecret.js";

// Resolves what to pass as Apple's `clientSecret`, preferring the self-generating key-material
// path over a static secret. Never throws — malformed key material just disables Apple for
// this call (logged), the same "degrade clean" contract as every other gate in this module.
function appleClientSecret(env) {
  if (env.AUTH_APPLE_TEAM_ID && env.AUTH_APPLE_KEY_ID && env.AUTH_APPLE_PRIVATE_KEY) {
    try {
      return buildAppleClientSecret({
        teamId: env.AUTH_APPLE_TEAM_ID,
        keyId: env.AUTH_APPLE_KEY_ID,
        privateKey: env.AUTH_APPLE_PRIVATE_KEY,
        clientId: env.AUTH_APPLE_ID,
      });
    } catch (err) {
      console.error("[oauthProviders] Apple client-secret JWT generation failed — Apple sign-in disabled for this request:", err?.message);
      return null;
    }
  }
  return env.AUTH_APPLE_SECRET || null;
}

// Returns the list of enabled social providers given an env bag (defaults to process.env).
// Pure + synchronous (no network, no async key import — node:crypto's ES256 sign is sync):
// provider factories just return config objects.
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

  if (env.AUTH_APPLE_ID) {
    const clientSecret = appleClientSecret(env);
    if (clientSecret) {
      providers.push(
        Apple({
          clientId: env.AUTH_APPLE_ID,
          clientSecret,
          allowDangerousEmailAccountLinking: true,
        }),
      );
    }
  }

  return providers;
}

// The ids of the enabled social providers — handy for the UI / a quick gate check without
// constructing the provider objects (and without paying for a JWT-signing pass). Mirrors the
// gating in socialProviders, but checks key *presence* rather than validity — a malformed
// Apple key still shows the button as "available" here; socialProviders is the source of
// truth for whether sign-in will actually work.
export function enabledSocialProviderIds(env = process.env) {
  const ids = [];
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) ids.push("google");
  const hasAppleKeyMaterial =
    env.AUTH_APPLE_TEAM_ID && env.AUTH_APPLE_KEY_ID && env.AUTH_APPLE_PRIVATE_KEY;
  if (env.AUTH_APPLE_ID && (env.AUTH_APPLE_SECRET || hasAppleKeyMaterial)) ids.push("apple");
  return ids;
}
