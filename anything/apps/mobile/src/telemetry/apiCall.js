// Pure helpers behind the api_call / error(api|network) events recorded by src/__create/fetch.ts.
//
// Privacy: the `route` that leaves the device is ALWAYS either a server route TEMPLATE from apiRoutes.js (params
// spelled ":id") or the token "unknown". A concrete path, id, handle, slug or query string is never reported.

import { ROUTE_PATTERN } from './registry';
import { areaForPath } from './apiAreas';
import { API_ROUTE_TEMPLATES } from './apiRoutes';
import { msBucket } from './bucket';

const ROUTE_RE = new RegExp(ROUTE_PATTERN);

// Index templates by segment count once: [{ segs, statics }].
const BY_LENGTH = new Map();
for (const tpl of API_ROUTE_TEMPLATES) {
  const segs = tpl.split('/').filter(Boolean);
  const entry = { tpl, segs, statics: segs.filter((s) => s !== ':id').length };
  const list = BY_LENGTH.get(segs.length);
  if (list) list.push(entry);
  else BY_LENGTH.set(segs.length, [entry]);
}

/**
 * "/api/pets/123/profile?x=1" or "https://base/api/pets/123" -> "/api/pets/123/profile" (query/hash stripped),
 * or null when the URL is not a first-party /api route. `baseUrl` is EXPO_PUBLIC_BASE_URL.
 */
export function apiPathFromUrl(url, baseUrl) {
  try {
    if (typeof url !== 'string') return null;
    let path = url;
    if (baseUrl && url.startsWith(baseUrl)) path = url.slice(baseUrl.length);
    path = path.split(/[?#]/)[0];
    if (path === '/api' || path.startsWith('/api/')) return path;
    return null;
  } catch {
    return null;
  }
}

/** Concrete API path -> server route template ("/api/pets/:id/profile") or "unknown". Never throws. */
export function routeTemplateForApiPath(path) {
  try {
    if (typeof path !== 'string') return 'unknown';
    const segs = path.split('/').filter(Boolean);
    const candidates = BY_LENGTH.get(segs.length);
    if (!candidates) return 'unknown';
    let best = null;
    for (const c of candidates) {
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        if (c.segs[i] !== ':id' && c.segs[i] !== segs[i]) {
          ok = false;
          break;
        }
      }
      if (ok && (!best || c.statics > best.statics)) best = c;
    }
    return best && ROUTE_RE.test(best.tpl) ? best.tpl : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** HTTP status -> "2xx" ... or "unknown" (no response / out of range). */
export function statusClassOf(status) {
  const n = Number(status);
  if (status === null || status === undefined || !Number.isInteger(n) || n < 100 || n > 599) return 'unknown';
  return `${Math.floor(n / 100)}xx`;
}

/** The telemetry endpoints themselves are never recorded (no feedback loop). */
export function isTelemetryPath(path) {
  return typeof path === 'string' && (path === '/api/telemetry' || path.startsWith('/api/telemetry/'));
}

/**
 * Everything api_call needs, or null when the call must not be recorded (not first-party /api, or a
 * /api/telemetry/* call). `status` is null for a request that never got a response.
 * @returns {{ area, route, status_class, ms_bucket } | null}
 */
export function buildApiCallProps({ url, status, ms, baseUrl } = {}) {
  try {
    const path = apiPathFromUrl(url, baseUrl);
    if (!path || isTelemetryPath(path)) return null;
    const bucket = msBucket(ms);
    if (!bucket) return null;
    return {
      area: areaForPath(path),
      route: routeTemplateForApiPath(path),
      status_class: statusClassOf(status),
      ms_bucket: bucket,
    };
  } catch {
    return null;
  }
}

/** Short machine code for an error value: its class name only, never the message. Matches ERROR_CODE_PATTERN. */
export function errorCodeOf(err, fallback = 'Error') {
  try {
    let name = '';
    if (err && typeof err === 'object' && typeof err.name === 'string') name = err.name;
    name = name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32);
    if (!name || /[0-9a-f]{12,}/i.test(name)) return fallback;
    return name;
  } catch {
    return fallback;
  }
}
