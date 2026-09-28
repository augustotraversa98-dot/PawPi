// socialAuthShared — PURE helpers for the native social-login flows.
//
// Kept free of any native-module import (expo-apple-authentication / expo-crypto / expo-web-browser)
// so they can be unit-tested in jest without those modules, and so the entry-file import graph
// stays light. The side-effecting sign-in functions live in ./socialAuth.

// The custom-scheme URL the system-browser Google flow returns to. MUST match the app scheme
// ("pawpi" in app.json) and the server's /api/auth/mobile-return default + validation prefix.
export const AUTH_RETURN_URL = "pawpi://auth-callback";

// Build the URL that starts the web Google OAuth inside the system browser. The server's
// /api/auth/mobile-start renders a self-submitting page that completes the OAuth and finally
// 302s to `returnUrl` carrying the session token.
export function buildGoogleStartUrl(baseUrl, returnUrl = AUTH_RETURN_URL) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return `${base}/api/auth/mobile-start?provider=google&return=${encodeURIComponent(returnUrl)}`;
}

// Parse the deep link the system browser hands back (e.g.
// pawpi://auth-callback?token=<jwt>&uid=<sub>&email=<..>&name=<..> or ...?error=unauthorized).
// Returns { jwt, user } on success, or null on cancel / error / missing token. Pure + defensive:
// custom-scheme URLs don't always parse cleanly through URL(), so we read the query manually.
export function parseAuthReturnUrl(url) {
  if (!url || typeof url !== "string") return null;

  // Take everything after the first '?' or '#'. Custom schemes (pawpi://) confuse URL(), so this
  // avoids depending on it.
  const qIndex = url.search(/[?#]/);
  if (qIndex === -1) return null;
  const query = url.slice(qIndex + 1);

  let params;
  try {
    params = new URLSearchParams(query);
  } catch {
    return null;
  }

  if (params.get("error")) return null;

  const jwt = params.get("token");
  if (!jwt) return null;

  const id = params.get("uid") || undefined;
  const email = params.get("email") || undefined;
  const name = params.get("name") || undefined;

  return { jwt, user: { id, email, name } };
}

// Decide which social buttons to render. Google shows when the backend has it enabled. Apple
// shows only on iOS AND when both the backend has it enabled and the device supports native
// Sign in with Apple (iOS 13+ — appleNativeAvailable). No "coming soon": a provider that isn't
// truly available simply isn't shown.
export function decideSocialButtons({ enabled, appleNativeAvailable, platform }) {
  const e = enabled || {};
  return {
    showGoogle: Boolean(e.google),
    showApple: platform === "ios" && Boolean(e.apple) && Boolean(appleNativeAvailable),
  };
}
