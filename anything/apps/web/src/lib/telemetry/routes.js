// Bounded `route` / `method` / `status_class` label values for pawpi_http_* metrics.
//
// A metric label must come from a small closed set. The primary source is the matched Hono route TEMPLATE
// (finite: one per route.js). Everything else is bucketed -- a raw URL, id, token or query string must
// never reach a label (contract principle 3).

import { KNOWN_API_PREFIXES } from './areas.js';

export const PAGE_ROUTE = '/__page'; // SPA pages, static assets, /integrations proxy -- anything outside /api
export const UNMATCHED_ROUTE = 'unmatched'; // /api/... that no handler matched (404/405) or an unusable path
export const OVERFLOW_ROUTE = 'overflow'; // fallback normalizer safety valve (see below)

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_RE = /^[0-9a-f]{12,}$/i;
const WORD_RE = /^[a-z_][a-z0-9_-]{0,39}$/i;

/** HTTP method label: the 7 standard verbs, anything else (clients can send arbitrary verbs) is 'OTHER'. */
export function methodLabel(method) {
  const m = typeof method === 'string' ? method.toUpperCase() : '';
  return METHODS.has(m) ? m : 'OTHER';
}

/** 200 -> '2xx'. Out-of-range / non-numeric -> 'unknown'. */
export function statusClass(status) {
  const n = Number(status);
  if (!Number.isInteger(n) || n < 100 || n > 599) return 'unknown';
  return `${Math.floor(n / 100)}xx`;
}

/**
 * Registered Hono path (`/api/pets/:petId/profile{.+}`) or Next-style file path (`/api/pets/[id]`) ->
 * template with every parameter spelled `:id` (`/api/pets/:id/profile`). Matched and fallback routes thus
 * share one vocabulary. A trailing wildcard (`/api/auth/*`) is kept as-is -- it is a registered pattern.
 */
export function templateFromRoutePath(routePath) {
  const clean = String(routePath).split(/[?#]/)[0];
  const segs = clean
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg === '*') return '*';
      if (/^\[.+\]$/.test(seg)) return ':id'; // [id] / [...slug]
      if (seg.startsWith(':')) return ':id'; // :id / :slug{.+}
      return seg;
    });
  return '/' + segs.join('/');
}

/**
 * Pick the terminal API template out of Hono's `c.req.matchedRoutes` (registration order). Skips the
 * catch-all middlewares ('*', '/api/*') and returns the last `/api/...` registration, i.e. the handler.
 */
export function pickMatchedApiPath(matchedRoutes) {
  if (!Array.isArray(matchedRoutes)) return undefined;
  for (let i = matchedRoutes.length - 1; i >= 0; i--) {
    const p = matchedRoutes[i]?.path;
    if (typeof p === 'string' && p.startsWith('/api/') && p !== '/api/*') return p;
  }
  return undefined;
}

/**
 * FALLBACK only (used when no template matched yet the request was served): strip query/hash, replace
 * numeric / uuid / long-hex / any digit-bearing / over-long / odd-charset segments with `:id`, and cap
 * the depth. A path whose first segment is not a known API prefix is not trusted at all -> 'unmatched'.
 */
export function normalizePath(rawPath) {
  try {
    if (typeof rawPath !== 'string') return UNMATCHED_ROUTE;
    const clean = rawPath.split(/[?#]/)[0];
    const segs = clean.split('/').filter(Boolean);
    if (segs[0] !== 'api' || !segs[1] || !KNOWN_API_PREFIXES.includes(segs[1])) return UNMATCHED_ROUTE;
    const out = segs.slice(0, 8).map((seg, i) => {
      if (i < 2) return seg; // 'api' + the validated prefix
      if (UUID_RE.test(seg) || LONG_HEX_RE.test(seg)) return ':id';
      if (/\d/.test(seg) || !WORD_RE.test(seg)) return ':id';
      return seg;
    });
    return '/' + out.join('/');
  } catch {
    return UNMATCHED_ROUTE;
  }
}

// Belt and braces for the fallback: even normalized, an attacker-shaped path space is unbounded, so after
// this many DISTINCT fallback routes we stop minting new label values.
const FALLBACK_CAP = 100;
const fallbackSeen = new Set();

/**
 * The `route` label for one request.
 *  - `matchedRoutes` : Hono c.req.matchedRoutes (preferred; template of the handler that ran)
 *  - `path`          : the request pathname (fallback + non-API detection)
 *  - `status`        : response status (404/405 are never normalized -- unknown paths are attacker input)
 */
export function routeLabel({ matchedRoutes, path, status }) {
  try {
    const p = typeof path === 'string' ? path : '';
    if (!p.startsWith('/api/')) return PAGE_ROUTE;
    const matched = pickMatchedApiPath(matchedRoutes);
    if (matched) return templateFromRoutePath(matched);
    if (status === 404 || status === 405) return UNMATCHED_ROUTE;
    const normalized = normalizePath(p);
    if (normalized === UNMATCHED_ROUTE) return UNMATCHED_ROUTE;
    if (!fallbackSeen.has(normalized)) {
      if (fallbackSeen.size >= FALLBACK_CAP) return OVERFLOW_ROUTE;
      fallbackSeen.add(normalized);
    }
    return normalized;
  } catch {
    return UNMATCHED_ROUTE;
  }
}
