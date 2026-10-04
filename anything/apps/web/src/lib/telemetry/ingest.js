// Request handling for the anonymous client-telemetry endpoints. The route files are thin wrappers so all of
// this is unit-testable with injected dependencies.
//
//   POST /api/telemetry/events  -> handleIngest(request)   (no auth, no DB)
//   GET  /api/telemetry/config  -> handleConfig()
//
// Order of work (cheap checks first, so garbage costs almost nothing):
//   kill switch -> content-length -> per-IP limit -> bounded body read -> JSON -> envelope -> per-install limit
//   -> per-event validation -> metrics + Loki line for ACCEPTED events only.
// Status: 204 success (even if every event was dropped), 400 bad envelope, 413 too big, 429 limited. NEVER 5xx:
// the whole handler is inside try/catch and a bug degrades to "204, nothing recorded".
// PRIVACY: the client IP is only hashed inside the limiter (ingestLimiter.ipKey); it is never logged or emitted.

import { LIMITS } from './registry.js';
import { validateEnvelope, validateEvent } from './ingestSchema.js';
import { createSlidingWindowLimiter, ipKey } from './ingestLimiter.js';
import { recordClientEvent, recordIngest, appVersionLabel } from './clientMetrics.js';
import { loki } from './loki.js';

// Per-install: a healthy client flushes every ~15 s (<= ~4 req/min); 30/min leaves plenty of room for bursts.
// Per-IP: a shared NAT / office behind one address, so 10x that. Tune with evidence.
export const INSTALL_LIMIT = { limit: 30, windowMs: 60_000, maxKeys: 10_000 };
export const IP_LIMIT = { limit: 300, windowMs: 60_000, maxKeys: 10_000 };

export const deps = {
  installLimiter: createSlidingWindowLimiter(INSTALL_LIMIT),
  ipLimiter: createSlidingWindowLimiter(IP_LIMIT),
  shipper: loki,
  env: () => process.env,
  now: () => Date.now(),
};

/** Kill switch + sample rate (GET /api/telemetry/config). */
export function telemetryConfig(env = process.env) {
  const enabled = env.TELEMETRY_INGEST_ENABLED !== 'false';
  const raw = env.TELEMETRY_SAMPLE_RATE;
  let sampleRate = raw === undefined || raw === '' ? 1 : Number(raw);
  if (!Number.isFinite(sampleRate)) sampleRate = 1;
  sampleRate = Math.min(1, Math.max(0, sampleRate));
  return { enabled, sampleRate };
}

export function handleConfig(d = deps) {
  return Response.json(telemetryConfig(d.env()), { headers: { 'Cache-Control': 'public, max-age=300' } });
}

const noContent = () => new Response(null, { status: 204 });
const fail = (status, code) => Response.json({ error: code }, { status });

/** Read the body but stop (and cancel the stream) as soon as it exceeds `max` bytes. Returns a string, or null if too big. */
async function readBodyLimited(request, max) {
  const reader = request.body?.getReader?.();
  if (!reader) {
    const text = await request.text();
    return Buffer.byteLength(text) > max ? null : text;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      try {
        await reader.cancel();
      } catch {}
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** One JSON log line for Loki. Labels are ONLY job/event/app_version/platform; the line never carries an IP or account data. */
export function lokiLine(event, envelope) {
  return {
    event: event.name,
    t: event.t,
    props: event.props,
    screen: event.props.screen ?? event.props.from ?? null,
    install_id: envelope.install_id,
    session_id: envelope.session_id,
    app_version: envelope.app_version,
    build: envelope.build,
    platform: envelope.platform,
    os_major: envelope.os_major,
    locale: envelope.locale,
    sent_at: envelope.sent_at,
  };
}

export function lokiLabels(event, envelope) {
  return {
    job: 'pawpi-client',
    event: event.name,
    app_version: appVersionLabel(envelope.app_version),
    platform: envelope.platform,
  };
}

export async function handleIngest(request, d = deps) {
  try {
    if (d.env().TELEMETRY_INGEST_ENABLED === 'false') {
      recordIngest('dropped'); // accept-and-discard
      return noContent();
    }

    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > LIMITS.maxBodyBytes) return fail(413, 'payload_too_large');

    if (!d.ipLimiter.hit(ipKey(request))) {
      recordIngest('rate_limited');
      return fail(429, 'rate_limited');
    }

    const text = await readBodyLimited(request, LIMITS.maxBodyBytes);
    if (text === null) return fail(413, 'payload_too_large');

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      recordIngest('invalid');
      return fail(400, 'invalid_json');
    }
    const envelope = validateEnvelope(body);
    if (!envelope) {
      recordIngest('invalid');
      return fail(400, 'invalid_envelope');
    }

    if (!d.installLimiter.hit(envelope.install_id)) {
      recordIngest('rate_limited');
      return fail(429, 'rate_limited');
    }

    const counts = { accepted: 0, dropped: 0, invalid: 0 };
    for (const raw of body.events) {
      const out = validateEvent(raw);
      counts[out.result] += 1;
      if (out.result !== 'accepted') continue;
      recordClientEvent(out.event, envelope);
      d.shipper.push(lokiLabels(out.event, envelope), JSON.stringify(lokiLine(out.event, envelope)));
    }
    for (const [result, n] of Object.entries(counts)) if (n > 0) recordIngest(result, n);
    return noContent();
  } catch {
    // A bug here must never become a 5xx for the app.
    try {
      recordIngest('dropped');
    } catch {}
    return noContent();
  }
}
