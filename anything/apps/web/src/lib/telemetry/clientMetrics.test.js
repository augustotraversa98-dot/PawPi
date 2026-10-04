// Metrics derived from accepted client events + the label-boundedness guard for them (mirrors labels.test.js:
// whatever a hostile client sends, only closed-list values or the capped app_version can reach the exporter).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const otel = vi.hoisted(() => {
  const calls = [];
  const mk = (kind) => (name, opts) => ({
    add: (v, attrs) => calls.push({ kind: 'counter', name, v, attrs }),
    record: (v, attrs) => calls.push({ kind: 'histogram', name, v, attrs, opts }),
  });
  return {
    calls,
    api: { metrics: { getMeter: () => ({ createCounter: mk('c'), createHistogram: mk('h'), createObservableGauge: () => ({ addCallback() {} }) }) } },
  };
});
vi.mock('@opentelemetry/api', () => otel.api);

import { recordClientEvent, recordIngest, appVersionLabel, MAX_APP_VERSIONS, MS_BUCKET_SECONDS, INGEST_RESULTS, __resetAppVersionsForTests } from './clientMetrics.js';
import { validateEvent } from './ingestSchema.js';
import { AREAS, SCREENS, MS_BUCKETS, ERROR_KINDS, STATUS_CLASSES, FUNNELS, PLATFORMS, EVENT_NAMES } from './registry.js';

const ENV = { platform: 'ios', app_version: '1.4.2' };
const ev = (name, props) => ({ name, t: 5, props });
const only = (name) => otel.calls.filter((c) => c.name === name);

beforeEach(() => {
  otel.calls.length = 0;
  __resetAppVersionsForTests();
});

describe('recordClientEvent -> contract metrics', () => {
  it('every event counts pawpi_client_events_total{event,platform,app_version}', () => {
    recordClientEvent(ev('opt_out', {}), ENV);
    expect(otel.calls).toEqual([
      { kind: 'counter', name: 'pawpi_client_events_total', v: 1, attrs: { event: 'opt_out', platform: 'ios', app_version: '1.4.2' } },
    ]);
  });

  it('session_start -> pawpi_client_sessions_total{app_version}', () => {
    recordClientEvent(ev('session_start', { cold: true }), ENV);
    expect(only('pawpi_client_sessions_total')[0].attrs).toEqual({ app_version: '1.4.2' });
  });

  it('screen_view -> pawpi_client_screen_views_total{screen,app_version}', () => {
    recordClientEvent(ev('screen_view', { screen: '/health' }), ENV);
    expect(only('pawpi_client_screen_views_total')[0].attrs).toEqual({ screen: '/health', app_version: '1.4.2' });
  });

  it('error -> pawpi_client_errors_total{kind,screen,app_version} (code stays out of the metric)', () => {
    recordClientEvent(ev('error', { kind: 'api', screen: '/services', code: '500' }), ENV);
    expect(only('pawpi_client_errors_total')[0].attrs).toEqual({ kind: 'api', screen: '/services', app_version: '1.4.2' });
  });

  it('api_call -> counter{area,status_class,app_version} + histogram{area,app_version} (route stays out)', () => {
    recordClientEvent(ev('api_call', { area: 'pets', route: '/api/pets/:id', status_class: '5xx', ms_bucket: 'lt1000' }), ENV);
    expect(only('pawpi_client_api_calls_total')[0].attrs).toEqual({ area: 'pets', status_class: '5xx', app_version: '1.4.2' });
    const h = only('pawpi_client_api_duration_seconds')[0];
    expect(h.attrs).toEqual({ area: 'pets', app_version: '1.4.2' });
    expect(h.v).toBe(MS_BUCKET_SECONDS.lt1000);
  });

  it('perf_screen_ready / perf_startup -> histograms with bucket representative values', () => {
    recordClientEvent(ev('perf_screen_ready', { screen: '/', ms_bucket: 'gte10000' }), ENV);
    recordClientEvent(ev('perf_startup', { ms_bucket: 'lt100' }), ENV);
    expect(only('pawpi_client_screen_ready_seconds')[0]).toMatchObject({ v: 15, attrs: { screen: '/', app_version: '1.4.2' } });
    expect(only('pawpi_client_startup_seconds')[0]).toMatchObject({ v: 0.05, attrs: { app_version: '1.4.2' } });
  });

  it('funnel_step -> pawpi_funnel_step_total{funnel,step} (no app_version)', () => {
    recordClientEvent(ev('funnel_step', { funnel: 'services', step: 'booking_done' }), ENV);
    expect(only('pawpi_funnel_step_total')[0].attrs).toEqual({ funnel: 'services', step: 'booking_done' });
  });

  it('events with no dedicated metric (tap, feature_used, form_step, nav redirect, session_end) only bump the events counter', () => {
    for (const e of [
      ev('tap', { target: 'back', screen: '/' }), ev('feature_used', { feature: 'search' }),
      ev('form_step', { form: 'booking', step: 'a', action: 'view' }), ev('session_end', { duration_s_bucket: 'lt10' }),
      ev('nav_unexpected_redirect', { from: '/services', to: '/onboarding', reason: 'other' }),
    ]) recordClientEvent(e, ENV);
    expect(otel.calls.map((c) => c.name)).toEqual(Array(5).fill('pawpi_client_events_total'));
  });

  it('histogram boundaries are the bucket edges and representatives fall in their own bucket', () => {
    const edges = [0.1, 0.3, 1, 3, 10];
    recordClientEvent(ev('perf_startup', { ms_bucket: 'lt100' }), ENV);
    expect(only('pawpi_client_startup_seconds')[0].opts.advice.explicitBucketBoundaries).toEqual(edges);
    const rep = MS_BUCKETS.map((b) => MS_BUCKET_SECONDS[b]);
    expect(rep.map((v) => edges.filter((e) => v > e).length)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('recordIngest counts n per result and ignores junk', () => {
    for (const r of INGEST_RESULTS) recordIngest(r, 3);
    recordIngest('weird'); recordIngest('accepted', 0); recordIngest('accepted', -1); recordIngest(undefined);
    expect(only('pawpi_telemetry_ingest_total').map((c) => [c.attrs.result, c.v])).toEqual(INGEST_RESULTS.map((r) => [r, 3]));
  });

  it('never throws, even on garbage', () => {
    for (const bad of [undefined, null, {}, { name: 'screen_view' }, { name: 'api_call', props: {} }])
      expect(() => recordClientEvent(bad, ENV)).not.toThrow();
    expect(() => recordClientEvent(ev('opt_out', {}), undefined)).not.toThrow();
  });
});

describe('appVersionLabel is bounded', () => {
  it('malformed / hostile versions collapse to "other"', () => {
    for (const v of ['', 'latest', '1.2.3; drop table', 'a@b.com', '1.2.3\n', '1.'.repeat(30), 'x'.repeat(5000), undefined, null, 7, {}, [], '1.2.3/../x'])
      expect(appVersionLabel(v), String(v).slice(0, 20)).toBe('other');
  });

  it('caps distinct versions at MAX_APP_VERSIONS, then "other"; known versions keep working', () => {
    const labels = [];
    for (let i = 0; i < 500; i++) labels.push(appVersionLabel(`1.${i}.0`));
    expect(new Set(labels).size).toBe(MAX_APP_VERSIONS + 1);
    expect(labels.slice(0, MAX_APP_VERSIONS)).toEqual(Array.from({ length: MAX_APP_VERSIONS }, (_, i) => `1.${i}.0`));
    expect(labels.at(-1)).toBe('other');
    expect(appVersionLabel('1.0.0')).toBe('1.0.0');
  });
});

// ---- label guard (mirror of labels.test.js) -----------------------------------------------------------------
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function unboundedReason(value) {
  const v = String(value);
  if (v.length > 120) return 'too long';
  if (/[?&=#@%\s]/.test(v)) return 'contains ? & = # @ % or whitespace';
  if (UUID_RE.test(v)) return 'contains a uuid';
  if (/[0-9a-f]{12,}/i.test(v)) return 'contains a long hex run';
  if (/[^\x20-\x7e]/.test(v)) return 'non-ascii / control chars';
  return null;
}

describe('client metric label cardinality', () => {
  it('whatever a hostile client sends, only closed-list values or a capped app_version reach the exporter', () => {
    const hostileVersions = ['1.2.3', 'evil@example.com', '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d', '9.9.9\u0000', 'x'.repeat(1000), '1.2.3?token=abc', ...Array.from({ length: 200 }, (_, i) => `2.${i}.1`)];
    const hostileScreens = ['/pets/3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d', '/health?token=abc', 'jane@example.com', '/x'.repeat(200), '', undefined, 5, {}];
    const sink = [];
    for (const app_version of hostileVersions)
      for (const screen of [...hostileScreens, '/health', '/services']) {
        const events = [
          ev('screen_view', { screen }), ev('error', { kind: 'js', screen }), ev('perf_screen_ready', { screen, ms_bucket: 'lt100' }),
          ev('api_call', { area: screen, route: '/api/x', status_class: screen, ms_bucket: 'lt100' }),
          ev('funnel_step', { funnel: screen, step: screen }), ev('tap', { target: screen, screen }),
        ];
        // route through the REAL validator first (as the endpoint does): only accepted events are recorded
        for (const e of events) {
          const out = validateEvent(e);
          if (out.result === 'accepted') recordClientEvent(out.event, { platform: 'ios', app_version });
        }
      }
    expect(otel.calls.length).toBeGreaterThan(100);

    const allowed = {
      event: new Set(EVENT_NAMES), platform: new Set(PLATFORMS), screen: new Set(SCREENS), kind: new Set(ERROR_KINDS),
      area: new Set(AREAS), status_class: new Set(STATUS_CLASSES), funnel: new Set(Object.keys(FUNNELS)),
      step: new Set(Object.values(FUNNELS).flat()), result: new Set(INGEST_RESULTS),
    };
    const versions = new Set();
    for (const { attrs } of otel.calls) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'app_version') {
          versions.add(v);
          expect(v === 'other' || /^\d{1,3}(\.\d{1,4}){1,3}(-[A-Za-z0-9.]{1,12})?$/.test(v), v).toBe(true);
        } else {
          expect(Object.keys(allowed), `unexpected label key ${k}`).toContain(k);
          expect(allowed[k].has(v), `${k}=${v}`).toBe(true);
        }
        expect(unboundedReason(v), `${k}=${v}`).toBeNull();
      }
    }
    expect(versions.size).toBeLessThanOrEqual(MAX_APP_VERSIONS + 1);
  });

  it('no metric ever carries an id-ish label key', () => {
    recordClientEvent(ev('api_call', { area: 'pets', route: '/api/pets/:id', status_class: '2xx', ms_bucket: 'lt100' }), { ...ENV, install_id: 'x', session_id: 'y' });
    for (const { attrs } of otel.calls) for (const k of Object.keys(attrs)) expect(['install_id', 'session_id', 'route', 'code', 'target', 'feature']).not.toContain(k);
  });
});
