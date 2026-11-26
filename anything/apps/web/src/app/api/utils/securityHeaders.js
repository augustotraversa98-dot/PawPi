import { getContext } from 'hono/context-storage';
import { NONCE, secureHeaders } from 'hono/secure-headers';

// AUDIT A-28 — baseline security response headers for the Hono server.
//
// CORS is already handled separately (and stays clean). This adds the
// defense-in-depth headers the audit flagged as missing: HSTS, clickjacking
// protection, MIME-sniffing protection, a tight Referrer-Policy, and a CSP.
//
// Scripts: this site's own files, plus inline <script> tags that carry the
// per-request nonce. No 'unsafe-inline' and no 'unsafe-eval'. Every inline
// script the server writes must take the nonce from cspNonce() below:
//   - React Router's hydration, scroll-restore and streamed-data scripts
//     (src/app/entry.server.tsx and src/app/root.tsx);
//   - /api/auth/mobile-start and /api/auth/expo-web-success.
// Inline event handlers (onclick="…") and javascript: URLs are blocked.
// <script type="application/ld+json"> is data, not script, and needs no nonce.
//
// Styles stay 'unsafe-inline' (React style attributes, styled-jsx, toasts).
//
// The policy is enforced, not report-only: there is no report collector, and the
// server writes every inline script itself.
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  scriptSrc: ["'self'", NONCE],
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

// `dev` is for the Vite dev server only: it injects inline scripts that carry no nonce.
// A nonce would make the browser ignore 'unsafe-inline', so dev gets none.
//
// `maps` is on when a browser Maps key is configured: the provider panel's location
// picker then loads the Google Maps JavaScript API.
export function cspDirectives({ dev = false, maps = false } = {}) {
  const directives = { ...CSP_DIRECTIVES };
  if (dev) {
    directives.scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
  }
  if (maps) {
    directives.scriptSrc = [
      ...directives.scriptSrc,
      'https://maps.googleapis.com',
      'https://maps.gstatic.com',
    ];
    directives.styleSrc = [...directives.styleSrc, 'https://fonts.googleapis.com'];
    directives.fontSrc = [...directives.fontSrc, 'https://fonts.gstatic.com'];
    directives.connectSrc = [...directives.connectSrc, 'data:', 'blob:'];
    directives.workerSrc = ["'self'", 'blob:'];
  }
  return directives;
}

// The nonce of the request being handled, for the inline <script> tags the server writes.
// undefined when the policy has none (dev) or outside a request (unit tests).
export function cspNonce() {
  try {
    return getContext().get('secureHeadersNonce');
  } catch {
    return undefined;
  }
}

export function securityHeaders({ dev = false } = {}) {
  return secureHeaders({
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'no-referrer',
    contentSecurityPolicy: cspDirectives({
      dev,
      maps: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY),
    }),
    permissionsPolicy: PERMISSIONS_POLICY,
    // Leave the remaining hono defaults (X-Download-Options,
    // X-Permitted-Cross-Domain-Policies, Cross-Origin-*-Policy) on.
  });
}
