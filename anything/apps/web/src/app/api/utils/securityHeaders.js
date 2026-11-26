import { secureHeaders } from 'hono/secure-headers';

// AUDIT A-28 — baseline security response headers for the Hono server.
//
// CORS is already handled separately (and stays clean). This adds the
// defense-in-depth headers the audit flagged as missing: HSTS, clickjacking
// protection, MIME-sniffing protection, a tight Referrer-Policy, and a CSP.
//
// The CSP is deliberately permissive on scripts/styles: the web app is React
// Router SSR with client hydration (inline bootstrap scripts + streamed inline
// data), and the account sign-in page is loaded top-level inside the mobile
// AuthWebView. A strict script-src would break hydration and login. The value
// of the policy here is the clickjacking backstop (`frame-ancestors 'none'`,
// matching X-Frame-Options: DENY — the WebView is a top-level navigation, never
// an iframe of our origin) and locking object/base URIs down, not script
// nonces. Tighten script-src to nonces in a later, dedicated pass.
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  // Fonts are self-hosted (public/fonts, @font-face in global.css), so no Google Fonts origin is allowed.
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  fontSrc: ["'self'", 'data:'],
  connectSrc: ["'self'", 'https:'],
  // WebKit (Safari, and therefore every iOS WebView / ASWebAuthenticationSession)
  // enforces `form-action` across redirects; Chrome does not. The mobile sign-in
  // start page (/api/auth/mobile-start) submits a form to /api/auth/signin/<provider>,
  // and @auth/core answers with a 302 to the provider's authorize endpoint. With
  // `form-action 'self'` WebKit silently blocks that redirect: the auth sheet hangs
  // on "Signing in…", never reaches Google, and no further request hits the server.
  // Every web-OAuth provider origin must therefore be listed here. Apple is native
  // on mobile (no browser form post), so it is intentionally absent.
  formAction: ["'self'", 'https://accounts.google.com'],
};

// Permissions-Policy: deny every powerful browser feature except the ones the web app actually uses.
// Inventory (grep of src/ + __create/, plus every embedded frame):
//   - clipboard-write  — the error boundary's "copy error" button (app/root.tsx). Same-origin only.
//   - fullscreen       — native <video controls> in the provider panel (VideoUploader). Same-origin only.
// Everything else is denied outright ("()"): there is no geolocation, camera, microphone, payment,
// share, autoplay or passkey call anywhere in the web app. The Google Maps picker is click-to-pin and
// renders in-page (no frame, no location lookup). Telehealth joins open the vendor's room in a NEW
// top-level tab (window.open, "noopener"), which is its own browsing context with its own policy, so
// this origin never needs camera/microphone. The app embeds no third-party frames at all, so there is
// no frame origin to allow. The sign-in page runs inside the mobile AuthWebView and needs none of these.
// Adding a feature later means adding it here deliberately (the test pins this exact set). Only use names
// Chromium recognises: it logs a console warning per page for an unknown one (`bluetooth` and `web-share`
// were tried and dropped for that reason; neither is used by the app).
export const PERMISSIONS_POLICY = {
  // allowed, same-origin only
  clipboardWrite: ['self'],
  fullscreen: ['self'],
  // denied
  accelerometer: [],
  autoplay: [],
  browsingTopics: [],
  camera: [],
  clipboardRead: [],
  displayCapture: [],
  encryptedMedia: [],
  geolocation: [],
  gyroscope: [],
  hid: [],
  idleDetection: [],
  magnetometer: [],
  microphone: [],
  midi: [],
  payment: [],
  pictureInPicture: [],
  publickeyCredentialsGet: [],
  screenWakeLock: [],
  serial: [],
  usb: [],
  xrSpatialTracking: [],
};

export function securityHeaders() {
  return secureHeaders({
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'no-referrer',
    contentSecurityPolicy: CSP_DIRECTIVES,
    permissionsPolicy: PERMISSIONS_POLICY,
    // Leave the remaining hono defaults (X-Download-Options,
    // X-Permitted-Cross-Domain-Policies, Cross-Origin-*-Policy) on.
  });
}
