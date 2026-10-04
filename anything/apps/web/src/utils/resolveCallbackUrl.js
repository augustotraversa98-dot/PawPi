// Resolves the post-auth redirect target for the web account pages.
//
// The /account/{signin,signup} pages serve two callers:
//  - The MOBILE web-auth bridge opens them with an explicit
//    `?callbackUrl=...` (e.g. /api/auth/token on device, or
//    /api/auth/expo-web-success in the Expo-web iframe) so Auth.js returns the
//    session to Expo. When that param is present we MUST honor it verbatim —
//    swapping it would break mobile sign-in.
//  - A STANDALONE-WEB visitor (a business owner who opens the page directly)
//    has no such param. They get the `fallback` — /provider — so they land on
//    the Create Provider form / provider dashboard instead of a not-found page.
//
// Pure: takes a location.search string, returns the resolved URL. No window access.
export function resolveCallbackUrl(search, fallback = "/provider") {
  try {
    const incoming = new URLSearchParams(search || "").get("callbackUrl");
    return incoming && incoming.trim() ? incoming : fallback;
  } catch {
    return fallback;
  }
}

// True when the page was opened by the mobile auth webview. The bridge always passes one of
// these two callbackUrl targets (AuthWebView.jsx: /api/auth/expo-web-success; the device
// token handoff: /api/auth/token). Standalone web never carries them, so a stray
// ?callbackUrl=/provider/... from a protected-page redirect still gets social buttons.
const MOBILE_BRIDGE_CALLBACKS = ["/api/auth/expo-web-success", "/api/auth/token"];

export function isMobileAuthWebview(search) {
  try {
    const incoming = new URLSearchParams(search || "").get("callbackUrl");
    if (!incoming) return false;
    const path = incoming.trim().split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/i, "");
    return MOBILE_BRIDGE_CALLBACKS.includes(path);
  } catch {
    return false;
  }
}
