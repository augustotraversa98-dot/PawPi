// Cross-site request check for /api/*: a request that changes data is served when it comes from PawPi's own pages,
// from an origin listed in CORS_ORIGINS, or from a caller that is not a web page. Anything else gets a 403 before
// any session lookup or route runs.
//
// A browser reports where a request comes from in headers that page scripts cannot set: Sec-Fetch-Site, and Origin
// on every method other than GET and HEAD.
//
// Served without looking at those headers:
//   - GET, HEAD, OPTIONS
//   - requests with a Bearer token (the mobile app): a browser never adds one by itself
//   - /api/auth/*: Auth.js checks its CSRF token (state / PKCE on provider callbacks); our own routes there are GET only
//   - the one-click email unsubscribe: mail clients POST it, and the signed token in the link is its only credential
//
// Otherwise:
//   - neither header (native app signed out, payment webhooks, cron, curl) -> served
//   - Sec-Fetch-Site same-origin (our pages) or none (started by the user, not by a page) -> served
//   - Origin listed in CORS_ORIGINS -> served
//   - Sec-Fetch-Site cross-site -> 403
//   - Origin whose host and port are this request's Host / X-Forwarded-Host -> served (browsers without
//     Sec-Fetch-Site; the scheme is not compared because TLS ends at the proxy)
//   - everything else, including other pawpi.info subdomains ("same-site") and "Origin: null" -> 403

export const CROSS_SITE_CODE = 'cross_site_request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isExempt = (path) =>
  path.startsWith('/api/auth/') || path === '/api/notification-prefs/email-unsubscribe';

// Same test as sessionGuard.js.
const hasBearer = (authorization) => /^Bearer [^ ]/.test(authorization ?? '');

// "host[:port]" as URL writes it for that scheme (lower case, default port dropped); null when unusable.
function normalizeHost(protocol, host) {
  try {
    return new URL(`${protocol}//${host.trim()}`).host;
  } catch {
    return null;
  }
}

function isOwnOrigin(origin, hosts) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false; // includes the literal "null"
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return hosts.some((host) => host && normalizeHost(url.protocol, host) === url.host);
}

export function originGuard({ env = process.env } = {}) {
  // Exact strings, as hono/cors matches them.
  const listed = new Set(
    (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin && origin !== 'null'),
  );

  const isAllowed = (c) => {
    const site = c.req.header('sec-fetch-site');
    const origin = c.req.header('origin');
    if (site === undefined && origin === undefined) return true;
    if (site === 'same-origin' || site === 'none') return true;
    if (origin === undefined) return false;
    if (listed.has(origin)) return true;
    if (site === 'cross-site') return false;
    return isOwnOrigin(origin, [
      c.req.header('host'),
      c.req.header('x-forwarded-host')?.split(',')[0],
    ]);
  };

  return async (c, next) => {
    if (
      SAFE_METHODS.has(c.req.method) ||
      isExempt(c.req.path) ||
      hasBearer(c.req.header('authorization')) ||
      isAllowed(c)
    ) {
      return next();
    }
    // No path here: some carry tokens. The access log already records the route template and the 403.
    const origin = c.req.header('origin')?.slice(0, 100) ?? null;
    console.warn(
      `[originGuard] refused ${c.req.method} sec-fetch-site=${c.req.header('sec-fetch-site') ?? '-'} origin=${JSON.stringify(origin)}`,
    );
    return c.json({ error: 'Request not allowed from this site', code: CROSS_SITE_CODE }, 403);
  };
}
