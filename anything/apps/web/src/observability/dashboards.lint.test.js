// @vitest-environment node
// Lint for observability/grafana/dashboards/*.json (Step C). No network. Fails (naming dashboard + panel + offender) when a
// dashboard charts a metric that is not in the telemetry contract, lacks a panel description, hard-codes a datasource uid,
// reads a Loki stream other than job="pawpi-client"|"pawpi-web", or puts an identifier in a metric label.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_NAMES } from '../lib/telemetry/registry.js';
import {
  EXPECTED_DASHBOARDS,
  analyzeLogQL,
  analyzePromQL,
  lintAll,
  lintDashboard,
  parseContract,
} from './dashboardLint.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// anything/apps/web/src/observability -> repo root is 5 levels up
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const DASH_DIR = path.join(REPO_ROOT, 'observability/grafana/dashboards');
const CONTRACT = path.join(REPO_ROOT, 'docs/observability/night-run/01-TELEMETRY-CONTRACT.md');

const contract = parseContract(fs.readFileSync(CONTRACT, 'utf8'));
const files = fs.readdirSync(DASH_DIR).filter((f) => f.endsWith('.json')).sort();
const entries = files.map((file) => ({ file, dashboard: JSON.parse(fs.readFileSync(path.join(DASH_DIR, file), 'utf8')) }));

function countPanels(d) {
  let n = 0;
  const walk = (ps) => ps.forEach((p) => {
    if (p.type !== 'row') n += 1;
    if (p.panels) walk(p.panels);
  });
  walk(d.panels);
  return n;
}

describe('telemetry contract parsing (single source of truth)', () => {
  it('finds the server, client-derived and Step A process metrics', () => {
    for (const name of [
      'pawpi_http_requests_total', 'pawpi_http_request_duration_seconds', 'pawpi_db_query_duration_seconds',
      'pawpi_db_errors_total', 'pawpi_business_events_total', 'pawpi_health_deep_ok', 'pawpi_process_memory_bytes',
      'pawpi_process_event_loop_lag_seconds', 'pawpi_process_uptime_seconds', 'pawpi_telemetry_ingest_total',
      'pawpi_client_events_total', 'pawpi_client_screen_views_total', 'pawpi_client_errors_total',
      'pawpi_client_api_calls_total', 'pawpi_client_api_duration_seconds', 'pawpi_client_screen_ready_seconds',
      'pawpi_client_startup_seconds', 'pawpi_funnel_step_total', 'pawpi_client_sessions_total',
    ]) {
      expect(contract.has(name), name).toBe(true);
    }
    expect(contract.get('pawpi_http_request_duration_seconds').type).toBe('histogram');
    expect([...contract.get('pawpi_http_requests_total').labels]).toEqual(['area', 'route', 'method', 'status_class']);
    expect([...contract.get('pawpi_process_memory_bytes').labels]).toEqual(['kind']);
    expect(contract.get('pawpi_health_deep_ok').labels.size).toBe(0);
  });
});

describe('dashboards-as-code lint (real files)', () => {
  it('ships exactly the expected dashboards, uid = pawpi-<file name>', () => {
    expect(files).toEqual(EXPECTED_DASHBOARDS.map((n) => `${n}.json`).sort());
    for (const { file, dashboard } of entries) expect(dashboard.uid).toBe(`pawpi-${file.replace(/\.json$/, '')}`);
  });

  it('every dashboard passes the lint', () => {
    const errors = lintAll(entries, { contract, eventNames: EVENT_NAMES });
    expect(errors).toEqual([]);
  });

  it('every panel (rows\' children included) has a description and panel ids are unique', () => {
    for (const { file, dashboard } of entries) {
      const seen = new Set();
      const walk = (ps) => ps.forEach((p) => {
        expect(seen.has(p.id), `${file}: duplicate id ${p.id}`).toBe(false);
        seen.add(p.id);
        if (p.type !== 'row') expect(String(p.description ?? '').trim().length, `${file}: "${p.title}" description`).toBeGreaterThan(10);
        if (p.panels) walk(p.panels);
      });
      walk(dashboard.panels);
      expect(countPanels(dashboard), file).toBeGreaterThanOrEqual(10);
    }
  });

  it('uses placeholders only: no hard-coded datasource uid anywhere in the raw JSON', () => {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(DASH_DIR, file), 'utf8');
      const uids = [...raw.matchAll(/"uid":\s*"([^"]*)"/g)].map((m) => m[1]).filter((u) => u !== `pawpi-${file.replace(/\.json$/, '')}`);
      for (const u of uids) expect(['${DS_PROMETHEUS}', '${DS_LOKI}', '-- Grafana --'], `${file}: uid ${u}`).toContain(u);
    }
  });

  it('only references the two documented Loki jobs', () => {
    let lokiTargets = 0;
    for (const { file, dashboard } of entries) {
      const all = JSON.stringify(dashboard);
      for (const m of all.matchAll(/job=\\?"([^"\\]*)\\?"/g)) expect(['pawpi-client', 'pawpi-web'], `${file}: job=${m[1]}`).toContain(m[1]);
      for (const p of dashboard.panels) for (const t of p.targets ?? []) if (t.datasource?.type === 'loki') lokiTargets += 1;
    }
    expect(lokiTargets).toBeGreaterThan(10);
  });

  it('has the required overview + auth + behaviour + bottleneck content', () => {
    const by = Object.fromEntries(entries.map((e) => [e.file.replace(/\.json$/, ''), e.dashboard]));
    const blob = (n) => JSON.stringify(by[n]);
    expect(blob('overview')).toContain('pawpi_health_deep_ok');
    expect(blob('overview')).toContain('pawpi_http_request_duration_seconds_bucket');
    expect(blob('overview')).toContain('pawpi_client_sessions_total');
    expect(blob('overview')).toContain('sum by (install_id)');
    expect(by.overview.annotations.list.some((a) => a.target?.tags?.includes('deploy'))).toBe(true);
    expect(blob('auth-onboarding')).toContain('pawpi_funnel_step_total');
    expect(blob('auth-onboarding')).toContain('nav_unexpected_redirect');
    expect(blob('behaviour')).toContain('offset 30d');
    expect(blob('bottlenecks')).toContain('le=\\"0.25\\"');
  });
});

// ---------------------------------------------------------------- negative tests: the lint must actually fail
function good() {
  return {
    uid: 'pawpi-demo',
    title: 'PawPi — Demo',
    schemaVersion: 39,
    editable: true,
    tags: ['pawpi'],
    refresh: '1m',
    time: { from: 'now-6h', to: 'now' },
    annotations: { list: [] },
    templating: { list: [] },
    panels: [
      {
        id: 1,
        type: 'timeseries',
        title: 'Requests',
        description: 'Bad: flat line means no traffic; check availability.',
        datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
        gridPos: { h: 6, w: 12, x: 0, y: 0 },
        targets: [
          {
            refId: 'A',
            datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
            expr: 'sum by (area) (rate(pawpi_http_requests_total{status_class="5xx"}[$__rate_interval]))',
          },
        ],
      },
      {
        id: 2,
        type: 'logs',
        title: 'Logs',
        description: 'Bad: error lines; open the route.',
        datasource: { type: 'loki', uid: '${DS_LOKI}' },
        gridPos: { h: 6, w: 12, x: 12, y: 0 },
        targets: [
          { refId: 'A', datasource: { type: 'loki', uid: '${DS_LOKI}' }, expr: '{job="pawpi-client", event="tap"} | json target="props.target"' },
        ],
      },
    ],
  };
}
const run = (d, file = 'demo.json') => lintDashboard({ file, dashboard: d, contract, eventNames: EVENT_NAMES });
const setExpr = (d, expr, i = 0) => {
  d.panels[i].targets[0].expr = expr;
  return d;
};

describe('lint negative tests (the lint really fails on bad fixtures)', () => {
  it('accepts the good fixture', () => {
    expect(run(good())).toEqual([]);
  });

  it('flags a metric that is not in the contract, naming dashboard, panel and metric', () => {
    const errs = run(setExpr(good(), 'sum(rate(http_server_request_duration_seconds_count[5m]))'));
    expect(errs.join('\n')).toMatch(/\[demo\.json\] panel "Requests" \(id 1\): metric "http_server_request_duration_seconds_count" is not in the telemetry contract/);
  });

  it('flags a histogram used without its _bucket/_sum/_count suffix and a suffix on a non-histogram', () => {
    expect(run(setExpr(good(), 'sum(pawpi_http_request_duration_seconds)')).join('\n')).toMatch(/is a histogram/);
    expect(run(setExpr(good(), 'sum(rate(pawpi_http_requests_total_bucket[5m]))')).join('\n')).toMatch(/not in the telemetry contract/);
  });

  it('accepts histogram suffixes and the Step A process gauges', () => {
    expect(run(setExpr(good(), 'histogram_quantile(0.95, sum by (le) (rate(pawpi_http_request_duration_seconds_bucket{route!="/__page"}[$__rate_interval])))'))).toEqual([]);
    expect(run(setExpr(good(), 'max by (kind) (pawpi_process_memory_bytes) / 1e6 + max(pawpi_process_uptime_seconds) + min(pawpi_health_deep_ok)'))).toEqual([]);
    expect(run(setExpr(good(), 'max(pawpi_process_event_loop_lag_seconds)'))).toEqual([]);
  });

  it('flags an undocumented matcher label', () => {
    const errs = run(setExpr(good(), 'sum(pawpi_http_requests_total{http_route="/x"})'));
    expect(errs.join('\n')).toMatch(/label "http_route" is not a documented label of pawpi_http_requests_total/);
  });

  it('flags an identifier used as a metric label (matcher, by-clause, legend)', () => {
    expect(run(setExpr(good(), 'sum(pawpi_client_events_total{install_id="x"})')).join('\n')).toMatch(/label "install_id" must never be a metric label/);
    expect(run(setExpr(good(), 'sum by (install_id) (pawpi_client_sessions_total)')).join('\n')).toMatch(/label "install_id" must never be a metric label/);
    const d = good();
    d.panels[0].targets[0].legendFormat = '{{session_id}}';
    expect(run(d).join('\n')).toMatch(/legendFormat uses forbidden label "session_id"/);
  });

  it('flags a missing, blank or multi-line description', () => {
    const d = good();
    delete d.panels[0].description;
    expect(run(d).join('\n')).toMatch(/panel "Requests" \(id 1\): missing description/);
    const e = good();
    e.panels[1].description = '   ';
    expect(run(e).join('\n')).toMatch(/panel "Logs" \(id 2\): missing description/);
    const f = good();
    f.panels[1].description = 'a\nb';
    expect(run(f).join('\n')).toMatch(/must be ONE line/);
  });

  it('checks the children of a collapsed row too', () => {
    const d = good();
    d.panels.push({ id: 9, type: 'row', title: 'More', collapsed: true, gridPos: { h: 1, w: 24, x: 0, y: 6 }, panels: [{ ...good().panels[0], id: 10, description: '', gridPos: { h: 6, w: 24, x: 0, y: 7 } }] });
    expect(run(d).join('\n')).toMatch(/panel "Requests" \(id 10\): missing description/);
  });

  it('flags duplicate panel ids', () => {
    const d = good();
    d.panels[1].id = 1;
    expect(run(d).join('\n')).toMatch(/duplicate panel id 1/);
  });

  it('flags a uid that does not match the file name', () => {
    const d = good();
    d.uid = 'pawpi-other';
    expect(run(d).join('\n')).toMatch(/uid "pawpi-other" must equal "pawpi-demo"/);
    const e = good();
    e.uid = 'demo';
    expect(run(e).join('\n')).toMatch(/must equal "pawpi-demo"/);
  });

  it('flags a hard-coded datasource uid (panel, target, annotation, variable)', () => {
    const d = good();
    d.panels[0].datasource = { type: 'prometheus', uid: 'grafanacloud-prom' };
    expect(run(d).join('\n')).toMatch(/hard-coded or invalid datasource/);
    const e = good();
    e.panels[0].targets[0].datasource = { type: 'prometheus', uid: 'abc123XYZ' };
    expect(run(e).join('\n')).toMatch(/abc123XYZ/);
    const f = good();
    f.annotations.list.push({ datasource: { type: 'prometheus', uid: 'x1y2z3' }, name: 'x' });
    expect(run(f).join('\n')).toMatch(/hard-coded or invalid datasource at \.annotations/);
    const g = good();
    g.templating.list.push({ name: 'v', type: 'query', datasource: { type: 'prometheus', uid: 'nope' }, query: 'label_values(pawpi_client_sessions_total, app_version)' });
    expect(run(g).join('\n')).toMatch(/hard-coded or invalid datasource/);
    const h = good();
    h.panels[0].datasource = 'prometheus';
    expect(run(h).join('\n')).toMatch(/hard-coded or invalid datasource/);
  });

  it('flags a Loki query outside the two pawpi jobs, a job regex, a missing job, a non-stream label or an unknown event', () => {
    expect(run(setExpr(good(), '{job="other"} | json', 1)).join('\n')).toMatch(/must have exactly one job/);
    expect(run(setExpr(good(), '{job=~"pawpi-.*"} | json', 1)).join('\n')).toMatch(/must have exactly one job/);
    expect(run(setExpr(good(), '{event="tap"} | json', 1)).join('\n')).toMatch(/must have exactly one job/);
    expect(run(setExpr(good(), '{job="pawpi-client", install_id="x"}', 1)).join('\n')).toMatch(/label "install_id" is not a Loki stream label/);
    expect(run(setExpr(good(), '{job="pawpi-client", event="made_up"}', 1)).join('\n')).toMatch(/unknown event "made_up"/);
    expect(run(setExpr(good(), '{job="pawpi-web"} | json level="level"', 1))).toEqual([]);
  });

  it('flags unbalanced / malformed expressions and unknown functions', () => {
    expect(run(setExpr(good(), 'sum(rate(pawpi_http_requests_total[5m])')).join('\n')).toMatch(/unclosed/);
    expect(run(setExpr(good(), 'sum(pawpi_http_requests_total{area="x"[5m]))')).join('\n')).toMatch(/unbalanced|unclosed/);
    expect(run(setExpr(good(), 'sum(pawpi_http_requests_total{area="x})')).join('\n')).toMatch(/unterminated string/);
    expect(run(setExpr(good(), 'frobnicate(pawpi_http_requests_total)')).join('\n')).toMatch(/unknown function "frobnicate"/);
    expect(run(setExpr(good(), 'sum(pawpi_http_requests_total) /')).join('\n')).toMatch(/dangling operator/);
    expect(run(setExpr(good(), '')).join('\n')).toMatch(/empty expression/);
    expect(run(setExpr(good(), '{job="pawpi-client"', 1)).join('\n')).toMatch(/unclosed/);
  });

  it('flags a wrong schemaVersion, a missing deploy annotation on overview and an id on the root', () => {
    const d = good();
    d.schemaVersion = 38;
    expect(run(d).join('\n')).toMatch(/schemaVersion must be 39/);
    expect(run(good(), 'overview.json').join('\n')).toMatch(/must equal "pawpi-overview"/);
    const o = good();
    o.uid = 'pawpi-overview';
    expect(run(o, 'overview.json').join('\n')).toMatch(/annotations tagged "deploy"/);
    const e = good();
    e.id = 7;
    expect(run(e).join('\n')).toMatch(/id must be omitted/);
  });

  it('flags a template variable that is not label_values(...) over contract metrics', () => {
    const d = good();
    d.templating.list.push({ name: 'v', type: 'query', datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' }, query: 'label_values(up, job)' });
    expect(run(d).join('\n')).toMatch(/metric "up" is not in the telemetry contract/);
  });

  it('flags duplicate dashboard uids across files', () => {
    const a = good();
    const b = good();
    const errs = lintAll([{ file: 'demo.json', dashboard: a }, { file: 'demo2.json', dashboard: b }], { contract, eventNames: EVENT_NAMES });
    expect(errs.join('\n')).toMatch(/duplicate dashboard uid pawpi-demo/);
  });
});

describe('expression analyzers', () => {
  it('extracts metric names and ignores keywords, functions, clauses, durations and variables', () => {
    const { problems, metrics } = analyzePromQL(
      '100 * (1 - sum by (op) (rate(pawpi_db_query_duration_seconds_bucket{le="0.25"}[$__range] offset 7d)) / on (op) group_left () sum by (op) (rate(pawpi_db_query_duration_seconds_count[${__interval}])))',
    );
    expect(problems).toEqual([]);
    expect(metrics.map((m) => m.name)).toEqual(['pawpi_db_query_duration_seconds_bucket', 'pawpi_db_query_duration_seconds_count']);
  });

  it('analyzeLogQL accepts selectors with braces inside line_format strings', () => {
    expect(analyzeLogQL('{job="pawpi-client", event="screen_view"} | json screen="screen" | line_format "{{.screen}}"', { eventNames: EVENT_NAMES })).toEqual([]);
  });
});
