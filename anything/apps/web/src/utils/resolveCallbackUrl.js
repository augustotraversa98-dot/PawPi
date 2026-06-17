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
