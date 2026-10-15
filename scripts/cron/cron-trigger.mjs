#!/usr/bin/env node
// Triggers one PawPi backend cron endpoint and exits. Run by a Railway cron service
// (docs/ops/railway-cron.md); also usable locally. Dependency-free (Node >= 18).
//
//   node scripts/cron/cron-trigger.mjs <job>
//
// Env:  CRON_BASE_URL (required)  backend origin, e.g. the public URL or the private-network URL
//       CRON_SECRET   (required)  sent as the x-cron-secret header
//       CRON_TIMEOUT_MS (optional, default 120000)  per-attempt timeout
//       CRON_RETRIES    (optional, default 2)       extra attempts after a connection error / 5xx
//
// Exit 0 = endpoint answered 2xx. Anything else (4xx, 5xx, redirect, timeout, no connection) = exit 1,
// so Railway marks the run failed. Output is job name, HTTP status and duration only: never the secret,
// headers, URL or response body.

import { pathToFileURL } from "node:url";

const JOBS = {
  "weekly-digest": "/api/engagement/weekly-digest/run",
  winback: "/api/engagement/reengagement/run",
  "push-receipts": "/api/notifications/push-receipts/run",
  subscriptions: "/api/payments/subscriptions/run",
  "calendar-sync": "/api/providers/calendar/sync",
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRIES = 2;
const BACKOFF_BASE_MS = 2_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const intFromEnv = (v, fallback) => (/^\d+$/.test(v ?? "") ? Number(v) : fallback);

function resolveBase(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".railway.internal");
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url;
  return null; // never send the secret over plain http to a public host
}

// One attempt. Returns { status } for any HTTP answer, or { error } with a safe label (no URL/secret).
async function attempt(url, secret, timeoutMs) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-cron-secret": secret },
      redirect: "manual", // never follow a redirect with the secret attached
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.arrayBuffer().catch(() => {}); // drain; body is deliberately never logged
    return { status: res.status };
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") return { error: "timeout" };
    return { error: "connection error" };
  }
}

export async function runJob(job, env = process.env, { log = console.log, wait = sleep } = {}) {
  const path = JOBS[job];
  if (!path) {
    log(`cron-trigger: unknown job "${String(job).slice(0, 40)}" (expected: ${Object.keys(JOBS).join(", ")})`);
    return 1;
  }
  const secret = env.CRON_SECRET;
  const base = env.CRON_BASE_URL ? resolveBase(env.CRON_BASE_URL) : null;
  if (!secret) {
    log(`cron-trigger: job=${job} CRON_SECRET is not set`);
    return 1;
  }
  if (!base) {
    log(`cron-trigger: job=${job} CRON_BASE_URL is missing or not an allowed https/internal URL`);
    return 1;
  }
  const url = new URL(path, base).toString();
  const timeoutMs = intFromEnv(env.CRON_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const retries = intFromEnv(env.CRON_RETRIES, DEFAULT_RETRIES);

  for (let n = 0; n <= retries; n++) {
    const started = Date.now();
    const r = await attempt(url, secret, timeoutMs);
    const ms = Date.now() - started;
    const tag = `cron-trigger: job=${job} attempt=${n + 1}/${retries + 1}`;

    if (r.status >= 200 && r.status < 300) {
      log(`${tag} status=${r.status} duration=${ms}ms OK`);
      return 0;
    }
    log(`${tag} ${r.status ? `status=${r.status}` : `error="${r.error}"`} duration=${ms}ms FAILED`);

    // Retry connection errors and 5xx only. NOT timeouts: the server may still be running the first
    // request, and overlapping a second run of a job (esp. subscriptions) is worse than waiting for the
    // next scheduled run. NOT 4xx/3xx: those are config errors a retry cannot fix.
    const retryable = r.error === "connection error" || r.status >= 500;
    if (!retryable || n === retries) return 1;
    await wait(BACKOFF_BASE_MS * 2 ** n);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runJob(process.argv[2]).then((code) => process.exit(code));
}
