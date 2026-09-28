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
import Credentials from "@auth/core/providers/credentials";
import { buildAppleClientSecret } from "./appleClientSecret.js";
import { verifyAppleIdentityToken } from "./appleIdentityToken.js";

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

// Google as a single, env-gated provider. Extracted so the SAME gating + config is reused by
// both the session-reader (src/auth.js, via socialProviders) and the REAL @auth/core handler
// (__create/index.ts) — the handler was the piece that never had a Google provider wired, so
// /api/auth/providers never listed it even with the env set. Returns [] when the keys are
// absent, so an install without Google keys behaves exactly as before.
export function googleProvider(env = process.env) {
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    return [
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    ];
  }
  return [];
}

// The WEB Apple provider (standard OAuth via a Services ID + client-secret JWT). Used only by
// the session-reader path (src/auth.js). The native app does NOT use this — its audience is the
// bundle id, not a Services ID — it uses appleNativeProvider() below instead.
export function appleWebProvider(env = process.env) {
  if (env.AUTH_APPLE_ID) {
    const clientSecret = appleClientSecret(env);
    if (clientSecret) {
      return [
        Apple({
          clientId: env.AUTH_APPLE_ID,
          clientSecret,
          allowDangerousEmailAccountLinking: true,
        }),
      ];
    }
  }
  return [];
}

// Returns the list of enabled social providers given an env bag (defaults to process.env).
// Pure + synchronous (no network, no async key import — node:crypto's ES256 sign is sync):
// provider factories just return config objects. This is the SESSION-READER list (src/auth.js)
// and keeps the web Apple provider; the real handler uses googleProvider + appleNativeProvider.
export function socialProviders(env = process.env) {
  return [...googleProvider(env), ...appleWebProvider(env)];
}

// The NATIVE "Sign in with Apple" provider for the real @auth/core handler (__create/index.ts).
//
// It is a Credentials-style provider (id 'apple-native') rather than the OAuth Apple provider,
// because the phone has ALREADY completed Sign in with Apple natively and hands us a verified
// identityToken — there is no browser round-trip and the audience is the bundle id, not a
// Services ID. authorize():
//   1. cryptographically verifies the identityToken against Apple's JWKS (iss / aud=bundle id /
//      exp / nonce = sha256(rawNonce)),
//   2. upserts auth_users + auth_accounts (provider 'apple') via the passed adapter, handling
//      Apple's first-login-only name and the private-relay email,
//   3. returns the user so @auth/core mints the SAME session JWT the app already uses.
//
// ENV-GATED on AUTH_APPLE_ID (the native audience). With it absent, returns [] and nothing
// changes. `verify` is injectable for tests. `adapter` is the @auth/core database adapter from
// the handler (NeonAdapter) so users are created in the one place the rest of auth uses.
export function appleNativeProvider({
  env = process.env,
  adapter,
  verify = verifyAppleIdentityToken,
} = {}) {
  if (!env.AUTH_APPLE_ID || !adapter) {
    return [];
  }
  return [
    Credentials({
      id: "apple-native",
      name: "Sign in with Apple",
      credentials: {
        identityToken: { label: "Identity Token", type: "text" },
        rawNonce: { label: "Raw Nonce", type: "text" },
        name: { label: "Name", type: "text" },
        email: { label: "Email", type: "text" },
      },
      authorize: async (credentials) => {
        const { identityToken, rawNonce, name, email: emailFromClient } = credentials || {};
        if (!identityToken || typeof identityToken !== "string") {
          return null;
        }

        let payload;
        try {
          payload = await verify({
            identityToken,
            rawNonce: typeof rawNonce === "string" ? rawNonce : undefined,
            clientId: env.AUTH_APPLE_ID,
          });
        } catch (err) {
          // Verification failure is an auth denial, not a 500. Log server-side; return null so
          // @auth/core reports invalid credentials.
          console.error("[apple-native] identity token verification failed:", err?.message);
          return null;
        }

        const appleSub = payload.sub;
        if (!appleSub) {
          return null;
        }

        // 1) Returning user — already linked by Apple's stable subject id.
        const existingByAccount = await adapter.getUserByAccount({
          provider: "apple",
          providerAccountId: appleSub,
        });
        if (existingByAccount) {
          return existingByAccount;
        }

        // Apple only sends email on the FIRST authorization; the private-relay address is a real,
        // deliverable Apple relay. Prefer the token's email, fall back to what the client passed.
        const email =
          (typeof payload.email === "string" && payload.email) ||
          (typeof emailFromClient === "string" && emailFromClient) ||
          null;

        // 2) Link to an existing account with the same email (mirrors
        // allowDangerousEmailAccountLinking on the OAuth providers).
        let user = null;
        if (email) {
          user = await adapter.getUserByEmail(email);
        }

        // 3) Brand-new user.
        if (!user) {
          user = await adapter.createUser({
            emailVerified: null,
            email,
            name: typeof name === "string" && name.length > 0 ? name : undefined,
          });
        }

        await adapter.linkAccount({
          type: "oidc",
          provider: "apple",
          providerAccountId: appleSub,
          userId: user.id,
          id_token: identityToken,
        });

        return user;
      },
    }),
  ];
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

// What the MOBILE app needs to decide which social buttons to render. This mirrors what the
// real @auth/core handler actually wires (googleProvider + appleNativeProvider), NOT the web
// Apple provider — so `apple` here means "native Sign in with Apple is available", which only
// requires AUTH_APPLE_ID (the native audience; no client secret / key material needed to VERIFY
// a native identity token). Google requires both OAuth keys. Returned by /api/auth/social-enabled.
export function socialEnabled(env = process.env) {
  return {
    google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
    apple: Boolean(env.AUTH_APPLE_ID),
  };
}
