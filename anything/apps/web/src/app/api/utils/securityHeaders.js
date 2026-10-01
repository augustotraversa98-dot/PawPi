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
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
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

export function securityHeaders() {
  return secureHeaders({
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'no-referrer',
    contentSecurityPolicy: CSP_DIRECTIVES,
    // Leave the remaining hono defaults (X-Download-Options,
    // X-Permitted-Cross-Domain-Policies, Cross-Origin-*-Policy) on.
  });
}
