// anything/apps/web/src/app/api/internal/grafana-alert/route.js
//
// Alert relay: Grafana Cloud fires an alert here (webhook contact point). We
// verify a shared secret, then trigger a GitHub `repository_dispatch` so the
// `claude-autofix` workflow can investigate and open a PR. Nothing here ever
// deploys or mutates data — it only opens a GitHub event.
//
// Env required (Railway):
//   ALERT_WEBHOOK_SECRET   shared secret Grafana sends in the Authorization header
//   GITHUB_DISPATCH_TOKEN  fine-grained PAT for augustotraversa98-dot/PawPi
//                          (Contents: RW, Pull requests: RW, Actions: RW)
// Optional:
//   GITHUB_REPO            defaults to "augustotraversa98-dot/PawPi"

import crypto from 'node:crypto';

const REPO = process.env.GITHUB_REPO || 'augustotraversa98-dot/PawPi';

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
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

  // Grafana Alerting webhook shape: { status, alerts: [{ status, labels, annotations, valueString, generatorURL, panelURL }], ... }
  const firing = (payload.alerts || []).filter((a) => a.status === 'firing');
  if (payload.alerts && firing.length === 0) {
    // Resolved-only notification — acknowledge, don't spin up a fix.
    return Response.json({ ok: true, dispatched: false, reason: 'no firing alerts' });
  }

  const first = firing[0] || {};
  const clientPayload = {
    source: 'grafana',
    status: payload.status || 'firing',
    alertname: first.labels?.alertname || payload.title || 'unknown',
    severity: first.labels?.severity || 'warning',
    summary:
      first.annotations?.summary ||
      first.annotations?.description ||
      payload.message ||
      '',
    value: first.valueString || '',
    labels: first.labels || {},
    generatorURL: first.generatorURL || '',
    panelURL: first.panelURL || '',
  };

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: 'GITHUB_DISPATCH_TOKEN not set' },
      { status: 503 },
    );
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'pawpi-grafana-relay',
    },
    body: JSON.stringify({
      event_type: 'grafana-alert',
      client_payload: clientPayload,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return Response.json(
      { ok: false, error: 'github dispatch failed', status: res.status, body },
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
