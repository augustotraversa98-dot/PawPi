// Structured server logs (night-run Step E): ONE access-log JSON line per HTTP request, shipped to Loki as
// job="pawpi-web" through the generic shipper (loki.js). Contract: docs/observability/night-run/01-TELEMETRY-CONTRACT.md "Logs".
//
// Line schema (exactly these keys, in this order):
//   { ts, level, msg, route, status, request_id, duration_ms, method }
//   ts          ISO-8601 UTC of the log call
//   level       error (5xx) | warn (4xx) | info (everything else)
//   msg         "<METHOD> <route template> -> <status>" (bounded text; passed through redactText)
//   route       the same bounded route TEMPLATE the pawpi_http_* metrics use (routeLabel) -- NEVER the raw path
//   status      HTTP status (number)
//   request_id  Hono requestId() value if it is a safe token, else null
//   duration_ms request duration, integer milliseconds
//   method      GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS/OTHER
// Loki STREAM labels are ONLY { job, level, area } (index stays tiny); everything else is a JSON field.
//
// Privacy / safety (all enforced here and unit-tested):
//   * No request bodies, query strings, headers, cookies, tokens, emails or user ids ever enter a line: the line is
//     built from a fixed set of bounded values, never from the request object. msg additionally goes through
//     redactText (email / Bearer / JWT / long-token / query-string scrubbing) as a second line of defence.
//   * No-op unless GRAFANA_LOKI_URL + _USER + _TOKEN are all set (the shipper's own rule) and LOG_SHIP_ENABLED is not "false".
//   * Free-tier protection (50 GB/month logs): 4xx/5xx and slow (>= 1 s) requests are never sampled, only capped by a
//     generous abuse bucket; 2xx/3xx lines are sampled with LOG_SAMPLE_2XX (0..1, default 1) AND limited by a
//     per-process token bucket (LOG_MAX_LINES_PER_SEC, default 20, burst 2x).
//   * Never throws, never awaits, never touches the response. The shipper bounds memory (queue cap, oldest dropped).
//
// Env (all optional): LOG_LEVEL (debug|info|warn|error, default info), LOG_SHIP_ENABLED ("false" = kill switch),
// LOG_SAMPLE_2XX, LOG_MAX_LINES_PER_SEC, LOG_MAX_ERROR_LINES_PER_SEC (default 50), LOG_STDOUT ("true" = also print the
// JSON line to stdout / Railway logs; default off to keep deploy logs quiet).

import { loki, lokiConfigFromEnv } from './loki.js';
import { httpLabels } from './httpMetrics.js';

export const LOG_JOB = 'pawpi-web';
/** JSON fields of every line, in order. The coverage guard checks dashboard queries against this list. */
export const LOG_FIELDS = Object.freeze(['ts', 'level', 'msg', 'route', 'status', 'request_id', 'duration_ms', 'method']);
/** The ONLY Loki stream labels of job="pawpi-web". */
export const LOG_LABELS = Object.freeze(['job', 'level', 'area']);
export const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
export const DEFAULT_LEVEL = 'info';
export const SLOW_MS = 1000; // requests at least this slow are never sampled out
const MAX_MSG = 200;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ---------------------------------------------------------------- redaction
const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)?/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BASIC_RE = /\bBasic\s+[A-Za-z0-9+/=]{8,}/g;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g; // api keys, hex digests, session ids, uuids without dashes
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const QUERY_RE = /\?[^\s]*=[^\s]*/g; // ?a=b&c=d
const CTRL_RE = /[\u0000-\u001f\u007f]+/g;

/** Scrub anything that looks like an email, Bearer/Basic/JWT credential, long token, uuid or query string. Never throws. */
export function redactText(input) {
  try {
    let s = typeof input === 'string' ? input : String(input ?? '');
    s = s
      .replace(CTRL_RE, ' ')
      .replace(BEARER_RE, 'Bearer [redacted]')
      .replace(BASIC_RE, 'Basic [redacted]')
      .replace(JWT_RE, '[jwt]')
      .replace(EMAIL_RE, '[email]')
      .replace(QUERY_RE, '?[redacted]')
      .replace(UUID_RE, '[id]')
      .replace(LONG_TOKEN_RE, '[redacted]');
    return s.length > MAX_MSG ? s.slice(0, MAX_MSG) + '...' : s;
  } catch {
    return '[unprintable]';
  }
}

// ---------------------------------------------------------------- level + settings
export function parseLevel(raw) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(LEVELS, v) ? v : DEFAULT_LEVEL;
}

/** Level of an access line from its status: 5xx error, 4xx warn, everything else info. */
export function levelForStatus(status) {
  const n = Number(status);
  if (n >= 500) return 'error';
  if (n >= 400) return 'warn';
  return 'info';
}

function num(raw, fallback, min, max) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Parse the LOG_* env into plain settings. Exported for tests and docs. */
export function logSettingsFromEnv(env = process.env) {
  return {
    shipEnabled: String(env.LOG_SHIP_ENABLED ?? '').trim().toLowerCase() !== 'false',
    level: parseLevel(env.LOG_LEVEL),
    sample2xx: num(env.LOG_SAMPLE_2XX, 1, 0, 1),
    maxLinesPerSec: num(env.LOG_MAX_LINES_PER_SEC, 20, 0, 1000),
    maxErrorLinesPerSec: num(env.LOG_MAX_ERROR_LINES_PER_SEC, 50, 0, 1000),
    stdout: String(env.LOG_STDOUT ?? '').trim().toLowerCase() === 'true',
  };
}

// ---------------------------------------------------------------- token bucket
/**
 * Classic token bucket: refills `ratePerSec` tokens per second up to `burst`. rate 0 => always refuses.
 * @param {{ratePerSec: number, burst?: number, now?: () => number}} o
 */
export function createTokenBucket({ ratePerSec, burst = Math.max(1, Math.ceil(ratePerSec * 2)), now = Date.now }) {
  let tokens = burst;
  let last = now();
  return {
    take() {
      try {
        const t = now();
        const elapsed = Math.max(0, t - last) / 1000;
        last = t;
        tokens = Math.min(burst, tokens + elapsed * ratePerSec);
        if (tokens >= 1) {
          tokens -= 1;
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------- the logger
/**
 * @param {object} [opts]
 * @param {{push: Function}} [opts.shipper]           default: the process-wide loki shipper
 * @param {() => object} [opts.getEnv]                default: process.env
 * @param {() => number} [opts.now]
 * @param {() => number} [opts.random]                0..1, injectable for tests
 * @param {(line: string) => void} [opts.writeStdout]
 */
export function createServerLogger({
  shipper = loki,
  getEnv = () => process.env,
  now = Date.now,
  random = Math.random,
  writeStdout = (line) => process.stdout.write(line + '\n'),
} = {}) {
  const stats = { shipped: 0, filteredLevel: 0, sampledOut: 0, rateLimited: 0, errors: 0 };
  // Buckets are rebuilt only when their configured rate changes (env is re-read per call so a restart is not needed in tests).
  let okBucket = null;
  let okRate = -1;
  let errBucket = null;
  let errRate = -1;

  function bucketFor(kind, rate) {
    if (kind === 'ok') {
      if (okRate !== rate) {
        okBucket = createTokenBucket({ ratePerSec: rate, now });
        okRate = rate;
      }
      return okBucket;
    }
    if (errRate !== rate) {
      errBucket = createTokenBucket({ ratePerSec: rate, now });
      errRate = rate;
    }
    return errBucket;
  }

  /**
   * Build the line + labels for one finished request (pure; used by logRequest and the tests).
   * @param {{method: string, path: string, matchedRoutes?: Array<{path: string}>, status: number, durationMs: number, requestId?: string}} r
   */
  function build(r) {
    const status = Number.isInteger(Number(r.status)) ? Number(r.status) : 0;
    const { counter } = httpLabels({ method: r.method, path: r.path, matchedRoutes: r.matchedRoutes, status });
    const level = levelForStatus(status);
    const route = redactText(counter.route);
    const duration = Number(r.durationMs);
    const durationMs = Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : 0;
    const rid = typeof r.requestId === 'string' && REQUEST_ID_RE.test(r.requestId) ? r.requestId : null;
    const line = {
      ts: new Date(now()).toISOString(),
      level,
      msg: redactText(`${counter.method} ${route} -> ${status}`),
      route,
      status,
      request_id: rid,
      duration_ms: durationMs,
      method: counter.method,
    };
    return { line, labels: { job: LOG_JOB, level, area: counter.area }, durationMs };
  }

  /**
   * Log one finished request. Never throws; returns what happened ('shipped' | 'off' | 'level' | 'sampled' | 'rate' | 'error').
   */
  function logRequest(r) {
    try {
      const env = getEnv();
      const s = logSettingsFromEnv(env);
      const shipping = s.shipEnabled && !!lokiConfigFromEnv(env);
      if (!shipping && !s.stdout) return 'off';

      const { line, labels, durationMs } = build(r);
      if (LEVELS[line.level] < LEVELS[s.level]) {
        stats.filteredLevel += 1;
        return 'level';
      }

      // Never sample errors / slow requests; everything else is sampled, then capped.
      const important = line.level !== 'info' || durationMs >= SLOW_MS;
      if (important) {
        if (!bucketFor('err', s.maxErrorLinesPerSec).take()) {
          stats.rateLimited += 1;
          return 'rate';
        }
      } else {
        if (s.sample2xx < 1 && random() >= s.sample2xx) {
          stats.sampledOut += 1;
          return 'sampled';
        }
        if (!bucketFor('ok', s.maxLinesPerSec).take()) {
          stats.rateLimited += 1;
          return 'rate';
        }
      }

      const text = JSON.stringify(line);
      if (s.stdout) {
        try {
          writeStdout(text);
        } catch {
          /* stdout closed: ignore */
        }
      }
      if (shipping) shipper.push(labels, text);
      stats.shipped += 1;
      return 'shipped';
    } catch {
      stats.errors += 1;
      return 'error';
    }
  }

  return { logRequest, build, stats: () => ({ ...stats }) };
}

/** Process-wide logger used by the Hono middleware in __create/index.ts. */
export const serverLogger = createServerLogger();

/** Convenience wrapper for the middleware: never throws. */
export function logHttpRequest(request) {
  return serverLogger.logRequest(request);
}
