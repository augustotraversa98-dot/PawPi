// socialAuth — the side-effecting native social sign-in flows.
//
//  • Apple (NATIVE): the native AppleAuthentication button returns a signed identityToken. We
//    complete an @auth/core "apple-native" Credentials sign-in over the RN cookie jar (CSRF →
//    callback → token) and get back the same session JWT email/password produces.
//  • Google (SYSTEM BROWSER): Google blocks OAuth inside embedded WebViews, so we open the web
//    OAuth in the system browser via WebBrowser.openAuthSessionAsync and receive the session JWT
//    back on the pawpi:// deep link (see /api/auth/mobile-start + /api/auth/mobile-return).
//
// Both resolve to { jwt, user } which the caller stores via useAuthStore.setAuth — identical to
// the email/password path — so the rest of the app is unchanged.

import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { nativeFetch } from "@/__create/fetch";
import {
  AUTH_RETURN_URL,
  buildGoogleStartUrl,
  parseAuthReturnError,
  parseAuthReturnUrl,
} from "./socialAuthShared";

const BASE_URL = process.env.EXPO_PUBLIC_BASE_URL;

// Platform headers matching what the auth WebView sends, so @auth/core derives the SAME origin
// (trustHost reads x-forwarded-host) across the CSRF/callback/token handshake and the cookies
// line up. Host itself is a forbidden fetch header on some platforms; x-forwarded-host is what
// actually drives the origin, so we rely on that.
function platformHeaders(extra = {}) {
  const h = {
    "x-createxyz-project-group-id": process.env.EXPO_PUBLIC_PROJECT_GROUP_ID,
    "x-forwarded-host": process.env.EXPO_PUBLIC_HOST,
    "x-createxyz-host": process.env.EXPO_PUBLIC_HOST,
    ...extra,
  };
  // Drop undefined values (e.g. env unset) so we never send "undefined".
  return Object.fromEntries(Object.entries(h).filter(([, v]) => v != null));
}

// Cryptographically-random raw nonce (hex). We send sha256(rawNonce) to Apple and the raw value
// to the server, which re-hashes and compares against the token's nonce claim (replay protection).
async function generateRawNonce() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/**
 * Native "Sign in with Apple". Returns { jwt, user } on success, or null if the user cancels.
 * Throws on a genuine failure (verification/network) so the caller can surface an error.
 */
export async function signInWithApple() {
  const rawNonce = await generateRawNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    // The user cancelling the native sheet is not an error to surface.
    if (err?.code === "ERR_REQUEST_CANCELED") return null;
    throw err;
  }

  const { identityToken, fullName, email } = credential || {};
  if (!identityToken) {
    throw new Error("Apple did not return an identity token");
  }

  // Apple sends the name only on the FIRST authorization; join the parts when present.
  const name = fullName
    ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ")
    : undefined;

  // 1) CSRF token (also sets the CSRF cookie in the RN cookie jar).
  const csrfRes = await nativeFetch(`${BASE_URL}/api/auth/csrf`, {
    method: "GET",
    headers: platformHeaders({ Accept: "application/json" }),
    credentials: "include",
  });
  const { csrfToken } = await csrfRes.json();

  // 2) Complete the credentials sign-in. This sets the @auth/core session cookie.
  const body = new URLSearchParams({
    csrfToken: csrfToken || "",
    callbackUrl: `${BASE_URL}/api/auth/token`,
    identityToken,
    rawNonce,
    json: "true",
  });
  if (name) body.set("name", name);
  if (email) body.set("email", email);

  await nativeFetch(`${BASE_URL}/api/auth/callback/apple-native`, {
    method: "POST",
    headers: platformHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: body.toString(),
    credentials: "include",
  });

  // 3) Read the freshly-minted session JWT (raw) + user, exactly like the WebView flow.
  const tokRes = await nativeFetch(`${BASE_URL}/api/auth/token`, {
    method: "GET",
    headers: platformHeaders({ Accept: "application/json" }),
    credentials: "include",
  });
  if (!tokRes.ok) {
    throw new Error(`Apple sign-in token exchange failed (${tokRes.status})`);
  }
  const data = await tokRes.json();
  if (!data?.jwt) {
    throw new Error("Apple sign-in did not yield a session token");
  }
  return { jwt: data.jwt, user: data.user };
}

/**
 * "Continue with Google" via the SYSTEM browser. Returns { jwt, user } on success, or null if
 * the user dismisses the browser. Throws only when the browser returned but carried no token.
 */
export async function signInWithGoogle() {
  const startUrl = buildGoogleStartUrl(BASE_URL, AUTH_RETURN_URL);
  const result = await WebBrowser.openAuthSessionAsync(startUrl, AUTH_RETURN_URL);
  if (result.type !== "success" || !result.url) {
    // dismiss / cancel / locked — nothing to store.
    return null;
  }
  const parsed = parseAuthReturnUrl(result.url);
  if (!parsed) {
    // The server redirected back with ?error=… — surface it distinctly so the UI can say
    // "couldn't sign in with Google" rather than a generic failure.
    const code = parseAuthReturnError(result.url);
    if (code) {
      const err = new Error(`Google sign-in was rejected (${code})`);
      err.code = "GOOGLE_AUTH_REJECTED";
      throw err;
    }
    throw new Error("Google sign-in returned without a session token");
  }
  return parsed;
}

/** Whether the device supports native Sign in with Apple (iOS 13+). Safe on non-iOS (false). */
export async function isAppleAuthAvailable() {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
