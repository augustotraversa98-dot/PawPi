// anything/apps/web/src/app/api/internal/grafana-alert/route.js
//
// Alert relay: Grafana Cloud fires an alert here (webhook contact point). We
// verify a shared secret, accept only KNOWN alert names, enforce a hard hourly
// cap, then trigger a GitHub `repository_dispatch` so the `claude-autofix`
// workflow can investigate and open a PR. Nothing here ever deploys or mutates
// data — it only opens a GitHub event.
//
// Hardening (autofix hardening phase 1):
//   - alert names are allow-listed (lib/alertRelayAllowlist.js); unknown -> 202 ignored, no dispatch
//   - hard cap of dispatches per hour, PERSISTED by asking GitHub how many claude-autofix runs were created in the last hour
//     (survives restarts and multiple instances, needs no table); if GitHub cannot be asked the relay FAILS CLOSED (503)
//   - the payload carries no free text (see lib/alertRelayPayload.js)
//
// Env required (Railway):
//   ALERT_WEBHOOK_SECRET   shared secret Grafana sends in the Authorization header
//   GITHUB_DISPATCH_TOKEN  fine-grained PAT for augustotraversa98-dot/PawPi. Needs Contents: write (repository_dispatch) and
//                          Actions: read (the hourly-cap count). Pull requests / Actions write are NOT needed.
// Optional:
//   GITHUB_REPO                        defaults to "augustotraversa98-dot/PawPi"
//   ALERT_MAX_DISPATCHES_PER_HOUR      hard cap, integer 1..60, default 6

import crypto from 'node:crypto';
import { buildClientPayload } from '@/lib/alertRelayPayload.js';
import { isKnownAlertName } from '@/lib/alertRelayAllowlist.js';

const REPO = process.env.GITHUB_REPO || 'augustotraversa98-dot/PawPi';
const WORKFLOW_FILE = 'claude-autofix.yml';
const DEFAULT_MAX_PER_HOUR = 6;

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function maxPerHour() {
  const raw = String(process.env.ALERT_MAX_DISPATCHES_PER_HOUR ?? '').trim();
  const n = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN; // strict digits only: '1e9' or '5x' are garbage, not 1 or 5
  return n >= 1 && n <= 60 ? n : DEFAULT_MAX_PER_HOUR;
}

const ghHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'pawpi-grafana-relay',
});

/** How many claude-autofix runs triggered by repository_dispatch were created in the last hour (null = could not be determined). */
async function dispatchesInLastHour(token) {
  const since = new Date(Date.now() - 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?event=repository_dispatch&per_page=1&created=${encodeURIComponent(`>=${since}`)}`;
  try {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (!res.ok) return null;
    const body = await res.json();
    return Number.isInteger(body?.total_count) ? body.total_count : null;
  } catch {
    return null;
  }
}

async function POST(request) {
  const secret = process.env.ALERT_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: 'not configured' }, { status: 503 });
  }

  // Accept "Authorization: Bearer <secret>" or "x-alert-secret: <secret>".
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const provided = bearer || request.headers.get('x-alert-secret') || '';
  if (!timingSafeEqual(provided, secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    /* Grafana test pings may be empty */
  }
  if (!payload || typeof payload !== 'object') payload = {};

  // Grafana Alerting webhook shape: { status, alerts: [{ status, labels, annotations, valueString, generatorURL, panelURL }], ... }
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  const firing = alerts.filter((a) => a && a.status === 'firing');
  if (alerts.length > 0 && firing.length === 0) {
    // Resolved-only notification — acknowledge, don't spin up a fix.
    return Response.json({ ok: true, dispatched: false, reason: 'no firing alerts' });
  }

  // Only alerts we know (real rules, legacy live rules, Grafana data-source alerts). An empty test ping or an unknown name is
  // acknowledged (202) and ignored: nothing is dispatched, so nothing can run.
  const known = firing.filter((a) => isKnownAlertName(a.labels?.alertname));
  if (known.length === 0) {
    return Response.json({ ok: true, dispatched: false, reason: 'ignored: not a known alert name' }, { status: 202 });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: 'GITHUB_DISPATCH_TOKEN not set' },
      { status: 503 },
    );
  }

  // Hard hourly cap, counted on GitHub (persisted). Fail closed if the count is unavailable.
  const cap = maxPerHour();
  const used = await dispatchesInLastHour(token);
  if (used === null) {
    return Response.json({ ok: false, dispatched: false, error: 'rate check unavailable' }, { status: 503 });
  }
  if (used >= cap) {
    return Response.json(
      { ok: false, dispatched: false, reason: `hourly dispatch cap reached (${used}/${cap})` },
      { status: 429, headers: { 'Retry-After': '900' } },
    );
  }

  // client_payload: max 10 top-level properties (GitHub 422s otherwise); fixed key set, no free text, see lib/alertRelayPayload.js.
  const clientPayload = buildClientPayload(payload, known);

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'grafana-alert',
      client_payload: clientPayload,
    }),
  });

  if (!res.ok) {
    // Do not echo GitHub's response body to the caller (internal detail); the status is enough to debug from the Railway logs.
    return Response.json(
      { ok: false, error: 'github dispatch failed', status: res.status },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, dispatched: true, alert: clientPayload.alertname });
}

// Health probe so you can curl the route quickly.
async function GET() {
  return Response.json({ ok: true, route: 'grafana-alert relay' });
}

export { POST, GET };
