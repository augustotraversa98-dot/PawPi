// Client-derived metrics: computed server-side from ACCEPTED client telemetry events (contract:
// 01-TELEMETRY-CONTRACT.md "Client-derived metrics"). Every label value comes from a CLOSED registry list or from
// `appVersionLabel` (bounded), so nothing a client sends can mint an unbounded series. Never throws; no-op
// without an OTel SDK (same style as httpMetrics.js / business.js).

import { metrics } from '@opentelemetry/api';
import { ENVELOPE_PATTERNS } from './registry.js';

export const INGEST_RESULTS = Object.freeze(['accepted', 'dropped', 'invalid', 'rate_limited']);

const meter = metrics.getMeter('pawpi-client-telemetry', '1.0.0');

const eventsTotal = meter.createCounter('pawpi_client_events_total', {
  description: 'Accepted anonymous client events by event, platform and app version',
});
const screenViews = meter.createCounter('pawpi_client_screen_views_total', {
  description: 'Client screen views by screen template and app version',
});
const clientErrors = meter.createCounter('pawpi_client_errors_total', {
  description: 'Client-side errors by kind, screen template and app version',
});
const apiCalls = meter.createCounter('pawpi_client_api_calls_total', {
  description: 'API calls made by the app by area, status class and app version',
});
const sessions = meter.createCounter('pawpi_client_sessions_total', {
  description: 'App sessions started, by app version',
});
const funnelSteps = meter.createCounter('pawpi_funnel_step_total', {
  description: 'Funnel steps reached (anonymous), by funnel and step',
});
const authDiag = meter.createCounter('pawpi_client_auth_diag_total', {
  description: 'Anonymous session / Keychain diagnostics by kind and app version',
});
const ingestTotal = meter.createCounter('pawpi_telemetry_ingest_total', {
  description: 'Client telemetry events (or requests, for rate_limited) by ingest result',
});

// Client durations arrive as BUCKETS, not exact values. We record a representative value per bucket: the
// geometric mean of its edges (open top bucket: 15 s), in seconds. The histogram boundaries are the bucket edges, so
// each representative lands in the intended bucket and histogram_quantile() returns a bucket-resolution estimate.
export const MS_BUCKET_SECONDS = Object.freeze({
  lt100: 0.05,
  lt300: 0.173,
  lt1000: 0.548,
  lt3000: 1.732,
  lt10000: 5.477,
  gte10000: 15,
});
const durationBuckets = { advice: { explicitBucketBoundaries: [0.1, 0.3, 1, 3, 10] } };

const apiDuration = meter.createHistogram('pawpi_client_api_duration_seconds', {
  description: 'Client-observed API call duration (bucket representative values) by area and app version',
  unit: 's',
  ...durationBuckets,
});
const screenReady = meter.createHistogram('pawpi_client_screen_ready_seconds', {
  description: 'Client time-to-ready per screen template (bucket representative values)',
  unit: 's',
  ...durationBuckets,
});
const startup = meter.createHistogram('pawpi_client_startup_seconds', {
  description: 'Client cold-start time (bucket representative values) by app version',
  unit: 's',
  ...durationBuckets,
});

// app_version is the one label a client controls the value of, so it is validated AND capped: at most
// MAX_APP_VERSIONS distinct values per process, then 'other'. (A hostile client can fill the slots; the cost is
// that a genuinely new release shows up as 'other' until the next restart/deploy -- see OPERATIONS.md.)
export const MAX_APP_VERSIONS = 20;
const APP_VERSION_RE = new RegExp(ENVELOPE_PATTERNS.app_version);
const seenVersions = new Set();

export function appVersionLabel(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 24 || !APP_VERSION_RE.test(raw)) return 'other';
    if (seenVersions.has(raw)) return raw;
    if (seenVersions.size >= MAX_APP_VERSIONS) return 'other';
    seenVersions.add(raw);
    return raw;
  } catch {
    return 'other';
  }
}

/** Test helper. */
export function __resetAppVersionsForTests() {
  seenVersions.clear();
}

/** Count `n` ingest outcomes. Never throws. */
export function recordIngest(result, n = 1) {
  try {
    if (!INGEST_RESULTS.includes(result) || !(n > 0)) return;
    ingestTotal.add(n, { result });
  } catch {}
}

/**
 * Update the client-derived metrics for ONE accepted (already validated) event.
 * @param {{name: string, props: object}} event
 * @param {{platform: string, app_version: string}} envelope
 */
export function recordClientEvent(event, envelope) {
  try {
    const app_version = appVersionLabel(envelope.app_version);
    const { name, props } = event;
    eventsTotal.add(1, { event: name, platform: envelope.platform, app_version });
    switch (name) {
      case 'session_start':
        sessions.add(1, { app_version });
        break;
      case 'screen_view':
        screenViews.add(1, { screen: props.screen, app_version });
        break;
      case 'error':
        clientErrors.add(1, { kind: props.kind, screen: props.screen, app_version });
        break;
      case 'api_call':
        apiCalls.add(1, { area: props.area, status_class: props.status_class, app_version });
        apiDuration.record(MS_BUCKET_SECONDS[props.ms_bucket], { area: props.area, app_version });
        break;
      case 'perf_screen_ready':
        screenReady.record(MS_BUCKET_SECONDS[props.ms_bucket], { screen: props.screen, app_version });
        break;
      case 'perf_startup':
        startup.record(MS_BUCKET_SECONDS[props.ms_bucket], { app_version });
        break;
      case 'auth_diag':
        authDiag.add(1, { diag: props.kind, app_version });
        break;
      case 'funnel_step':
        funnelSteps.add(1, { funnel: props.funnel, step: props.step });
        break;
      default:
        break;
    }
  } catch {
    // telemetry must never throw
  }
}
