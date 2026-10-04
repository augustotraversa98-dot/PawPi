// GET /api/health/deep logic: a cheap `select 1` against the database with a hard timeout.
// Public + unauthenticated by design (an uptime probe), so the body carries NOTHING sensitive:
// { ok, db_ms, version } only -- no error text, host, env or connection details.
//
// Uses the global `pool` directly -- NOT the request-transaction `sql` proxy -- so a probe never takes
// part in an identity transaction and works even when no request context exists. `select 1` touches no
// table, so RLS is irrelevant.

import { metrics } from '@opentelemetry/api';
import { pool } from '@/app/api/utils/sql';

export const DEEP_HEALTH_TIMEOUT_MS = 3000;

/** Short git sha of the running deploy, or 'dev'. Same source as service.version in instrumentation.mjs. */
export function appVersion(env = process.env) {
  return env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';
}

let lastOk = null; // null until the first probe, so we never report a made-up value
const meter = metrics.getMeter('pawpi-health', '1.0.0');
// No `unit`: unit "1" would make a Prometheus translator append `_ratio` to the name.
meter
  .createObservableGauge('pawpi_health_deep_ok', {
    description: '1 if the last /api/health/deep probe reached the database, 0 if it failed',
  })
  .addCallback((obs) => {
    if (lastOk !== null) obs.observe(lastOk ? 1 : 0);
  });

/**
 * Run the probe. `query` is injectable for tests; default is `select 1` on the global pool.
 * @returns {Promise<{ok: boolean, db_ms: number, version: string}>}
 */
export async function runDeepHealth({
  query = () => pool`select 1 as ok`,
  timeoutMs = DEEP_HEALTH_TIMEOUT_MS,
  version = appVersion(),
} = {}) {
  const started = Date.now();
  let timer;
  let ok = false;
  let pending;
  try {
    pending = query();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    await Promise.race([pending, timeout]);
    ok = true;
  } catch {
    ok = false;
    try {
      pending?.cancel?.(); // free the pooled connection if the query is still running
    } catch {}
    // swallow a late rejection of the abandoned query so it can't surface as unhandledRejection
    Promise.resolve(pending).catch(() => {});
  } finally {
    clearTimeout(timer);
  }
  lastOk = ok;
  return { ok, db_ms: Date.now() - started, version };
}
