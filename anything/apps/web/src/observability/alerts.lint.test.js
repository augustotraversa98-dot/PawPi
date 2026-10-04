// @vitest-environment node
// Lint for observability/grafana/alerts/*.json (Step D). No network. Fails (naming file + rule uid + offender) when a rule is
// not paused, can page on no-data, lacks a "What to do:" runbook line, uses a metric/label outside the telemetry contract,
// hard-codes a datasource, or carries an unbounded label. Includes negative fixtures proving each check bites.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseContract } from './dashboardLint.js';
import { TIER_FILES, lintAlertFile, lintAlerts, lintRule } from './alertLint.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const DIR = path.join(REPO_ROOT, 'observability/grafana/alerts');
const contract = parseContract(fs.readFileSync(path.join(REPO_ROOT, 'docs/observability/night-run/01-TELEMETRY-CONTRACT.md'), 'utf8'));
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const entries = files.map((file) => ({ file, doc: JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')) }));
const rules = entries.flatMap(({ file, doc }) => doc.groups.flatMap((g) => g.rules.map((rule) => ({ file, group: g.name, rule }))));
const byUid = (uid) => rules.find((r) => r.rule.uid === uid).rule;

const P1 = [
  'pawpi-p1-health-deep-failing', 'pawpi-p1-server-silent', 'pawpi-p1-http-5xx-rate', 'pawpi-p1-signin-failure-spike',
  'pawpi-p1-signup-collapse', 'pawpi-p1-payments-failures', 'pawpi-p1-db-errors', 'pawpi-p1-client-crash-rate',
  'pawpi-p1-client-api-5xx', 'pawpi-p1-route-4xx-burst',
];
// Server rules resumed as code in night run 3; any further rule must be resumed in its own reviewed change (update this list with it).
const ACTIVE = ['pawpi-p1-server-silent', 'pawpi-p1-http-5xx-rate', 'pawpi-p1-db-errors', 'pawpi-p1-health-deep-failing'];
const P2 = [
  'pawpi-p2-slow-routes', 'pawpi-p2-activation-funnel-drop', 'pawpi-p2-nav-unexpected-redirect', 'pawpi-p2-telemetry-silent',
  'pawpi-p2-free-tier-usage',
];

describe('alert rules as code (real files)', () => {
  it('one file per tier, exactly the specified rules', () => {
    expect(files).toEqual(Object.keys(TIER_FILES).map((n) => `${n}.json`).sort());
    const uids = (f) => entries.find((e) => e.file === f).doc.groups.flatMap((g) => g.rules.map((r) => r.uid));
    expect(uids('p1-critical.json')).toEqual(P1);
    expect(uids('p2-digest.json')).toEqual(P2);
  });

  it('every rule passes the lint (contract metrics + labels only, placeholders only, paused, runbook, ...)', () => {
    expect(lintAlerts(entries, { contract })).toEqual([]);
  });

  it('only the four server rules are declared active (isPaused:false); every other rule is PAUSED, no-data is OK, has a pending period, severity label, area and a "What to do:" line', () => {
    expect(rules).toHaveLength(15);
    for (const { rule } of rules) {
      expect(rule.isPaused, rule.uid).toBe(!ACTIVE.includes(rule.uid));
      expect(rule.noDataState, rule.uid).toBe('OK');
      expect(rule.for, rule.uid).toMatch(/^\d+[smhd]$/);
      expect(['P1', 'P2'], rule.uid).toContain(rule.labels.severity);
      expect(rule.labels.pawpi_managed, rule.uid).toBe('true');
      expect(rule.annotations.runbook, rule.uid).toMatch(/^What to do: \S/);
      expect(rule.annotations.summary.length, rule.uid).toBeGreaterThan(10);
      expect(rule.uid.startsWith('pawpi-')).toBe(true);
      const hasArea = rule.labels.area || /by \([^)]*\barea\b/.test(rule.data[0].model.expr);
      expect(hasArea, `${rule.uid} area`).toBeTruthy();
    }
  });

  it('thresholds are exactly the specified ones', () => {
    const th = (uid) => {
      const c = byUid(uid).data.find((d) => d.refId === 'C').model.conditions[0].evaluator;
      return `${c.type} ${c.params[0]}`;
    };
    expect(th('pawpi-p1-http-5xx-rate')).toBe('gt 5'); // 5xx rate > 5%
    expect(byUid('pawpi-p1-http-5xx-rate').for).toBe('5m'); // (5m)
    expect(byUid('pawpi-p1-http-5xx-rate').data[0].model.expr).toContain('[5m]');
    expect(th('pawpi-p1-client-api-5xx')).toBe('gt 10'); // client API 5xx share > 10%
    expect(th('pawpi-p2-activation-funnel-drop')).toBe('lt 0.7'); // funnel step drop > 30% vs 7-day
    expect(byUid('pawpi-p2-activation-funnel-drop').data[0].model.expr).toContain('offset 1d');
    expect(th('pawpi-p2-nav-unexpected-redirect')).toBe('gt 0'); // nav_unexpected_redirect > 0 sustained
    expect(byUid('pawpi-p2-nav-unexpected-redirect').for).toBe('30m');
    expect(byUid('pawpi-p2-telemetry-silent').data[0].model.expr).toContain('[6h]'); // silent for 6h
    expect(th('pawpi-p2-free-tier-usage')).toBe('gt 70'); // free-tier usage > 70%
    expect(byUid('pawpi-p1-signup-collapse').data[0].model.expr).toContain('[7d]'); // vs 7-day
  });

  it('rules that preserve route / app_version through by (...) say so; the telemetry-silent rule can never page on no data', () => {
    expect(byUid('pawpi-p1-route-4xx-burst').data[0].model.expr).toMatch(/by \(area, route\)/);
    expect(byUid('pawpi-p1-client-crash-rate').data[0].model.expr).toMatch(/by \(app_version\)/);
    expect(byUid('pawpi-p1-client-api-5xx').data[0].model.expr).toMatch(/by \(area, app_version\)/);
    const silent = byUid('pawpi-p2-telemetry-silent');
    expect(silent.noDataState).toBe('OK');
    expect(silent.annotations.description).toMatch(/NO DATA never alerts/);
    // sessions must have existed before: without client series (pre build 25) the whole expression is empty
    expect(silent.data[0].model.expr).toContain('pawpi_client_sessions_total[7d] offset 6h');
  });

  it('titles (= alertname) are branch-name safe and unique', () => {
    const titles = rules.map((r) => r.rule.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t).toMatch(/^P[12]-[A-Za-z0-9]+$/);
  });
});

describe('alert lint negative fixtures', () => {
  const base = () => JSON.parse(JSON.stringify(byUid('pawpi-p1-http-5xx-rate')));
  const lint = (mut, file = 'p1-critical.json', group = 'pawpi-p1-critical') => {
    const r = base();
    mut(r);
    return lintRule({ file, groupName: group, rule: r, contract }).join('\n');
  };
  const expr = (r, e) => {
    r.data[0].model.expr = e;
  };

  it('the unmodified rule is clean (control)', () => {
    expect(lint(() => {})).toBe('');
  });

  it('safety switches', () => {
    expect(lint((r) => { r.isPaused = false; })).toBe(''); // an explicit resume is allowed (the allow-list test above pins which rules)
    expect(lint((r) => { delete r.isPaused; })).toMatch(/isPaused must be true/);
    expect(lint((r) => { r.isPaused = 'no'; })).toMatch(/isPaused must be true/);
    expect(lint((r) => { r.noDataState = 'Alerting'; })).toMatch(/noDataState must be "OK"/);
    expect(lint((r) => { r.noDataState = 'NoData'; })).toMatch(/noDataState must be "OK"/);
    expect(lint((r) => { delete r.for; })).toMatch(/"for" \(pending period\) is required/);
    expect(lint((r) => { r.for = '5 minutes'; })).toMatch(/"for"/);
    expect(lint((r) => { r.execErrState = 'Explode'; })).toMatch(/execErrState/);
  });

  it('identity, tier and labels', () => {
    expect(lint((r) => { r.uid = 'http-5xx'; })).toMatch(/uid must match/);
    expect(lint((r) => { r.uid = 'pawpi-p2-http-5xx-rate'; })).toMatch(/uid must start with pawpi-p1-/);
    expect(lint((r) => { r.title = 'P1 5xx rate'; })).toMatch(/title .* must match/);
    expect(lint((r) => { r.labels.severity = 'critical'; })).toMatch(/severity must be P1 or P2/);
    expect(lint((r) => { r.labels.severity = 'P2'; })).toMatch(/does not match the file tier P1/);
    expect(lint((r) => { delete r.labels.pawpi_managed; })).toMatch(/pawpi_managed/);
    expect(lint((r) => { r.labels.route = '/api/pets/:id'; })).toMatch(/static label "route" is not allowed/);
    expect(lint((r) => { r.labels.team = '{{ $labels.user }}'; })).toMatch(/static label "team"/);
    expect(lint((r) => { r.labels.area = 'planet'; })).toMatch(/not a known area/);
    expect(lint((r) => { r.labels.area = 'auth'; })).toMatch(/also a by \(\.\.\.\) label/);
    expect(lint((r) => { expr(r, 'sum(rate(pawpi_http_requests_total[5m]))'); })).toMatch(/rule has no area/);
    expect(lint(() => {}, 'p2-digest.json', 'pawpi-p2-digest')).toMatch(/uid must start with pawpi-p2-/);
    expect(lint(() => {}, 'p1-critical.json', 'grafana-group')).toMatch(/group "grafana-group" must start with pawpi-/);
  });

  it('annotations: runbook "What to do:" line is mandatory and templating must reference real labels', () => {
    expect(lint((r) => { delete r.annotations.runbook; })).toMatch(/annotations.runbook is required/);
    expect(lint((r) => { r.annotations.runbook = 'Check the dashboard'; })).toMatch(/must start with "What to do:"/);
    expect(lint((r) => { r.annotations.runbook = 'What to do:'; })).toMatch(/must start with "What to do:"/);
    expect(lint((r) => { r.annotations.runbook = 'What to do: a\nb'; })).toMatch(/ONE line/);
    expect(lint((r) => { delete r.annotations.summary; })).toMatch(/annotations.summary is required/);
    expect(lint((r) => { r.annotations.summary = 'bad {{ $labels.route }}'; })).toMatch(/\$labels\.route }} but the rule has no such label/);
    expect(lint((r) => { r.annotations.owner = 'me'; })).toMatch(/unexpected annotations: owner/);
  });

  it('queries: contract metrics and labels only', () => {
    expect(lint((r) => { expr(r, 'sum by (area) (rate(http_server_request_duration_seconds_count[5m]))'); })).toMatch(/metric "http_server_request_duration_seconds_count" is not in the telemetry contract/);
    expect(lint((r) => { expr(r, 'sum by (area) (rate(pawpi_payment_failure_total[5m]))'); })).toMatch(/not in the telemetry contract/);
    expect(lint((r) => { expr(r, 'sum by (area) (rate(pawpi_http_requests_total{status="500"}[5m]))'); })).toMatch(/label "status" is not a documented label of pawpi_http_requests_total/);
    expect(lint((r) => { expr(r, 'sum by (area, install_id) (rate(pawpi_http_requests_total[5m]))'); })).toMatch(/label "install_id" must never be grouped on/);
    expect(lint((r) => { expr(r, 'sum by (area) (rate(pawpi_http_requests_total{user_id="1"}[5m]))'); })).toMatch(/label "user_id" must never be used/);
    expect(lint((r) => { expr(r, 'sum by (area, op) (rate(pawpi_http_requests_total[5m]))'); })).toMatch(/by\/on label "op" is not a documented label/);
    expect(lint((r) => { expr(r, 'histogram_quantile(0.95, sum by (le, area) (rate(pawpi_http_request_duration_seconds[5m])))'); })).toMatch(/is a histogram: use/);
    expect(lint((r) => { expr(r, 'sum by (area) (rate(pawpi_http_requests_total[5m])'); })).toMatch(/unclosed/);
    expect(lint((r) => { expr(r, 'sum by (area) (bogus_fn(pawpi_http_requests_total[5m]))'); })).toMatch(/unknown function "bogus_fn"/);
    expect(lint((r) => { expr(r, 'sum by (area) (rate(pawpi_http_requests_total[5m]))'); })).toBe('');
    expect(lint((r) => { r.data[0].model.instant = false; })).toMatch(/must be an instant query/);
  });

  it('datasources: placeholders only; the usage metrics are allowed ONLY on the usage datasource', () => {
    expect(lint((r) => { r.data[0].datasourceUid = 'P1809F7CD0C75ACF3'; })).toMatch(/datasourceUid "P1809F7CD0C75ACF3" must be a placeholder/);
    expect(lint((r) => { r.data[0].model.datasource.uid = 'abc'; })).toMatch(/model.datasource must match datasourceUid/);
    expect(lint((r) => { r.data[0].datasourceUid = '${DS_LOKI}'; r.data[0].model.datasource = { type: 'loki', uid: '${DS_LOKI}' }; })).toMatch(/Loki rules are not used/);
    expect(lint((r) => { expr(r, 'max(grafanacloud_instance_active_series)'); })).toMatch(/not in the telemetry contract/);
    const usage = JSON.parse(JSON.stringify(byUid('pawpi-p2-free-tier-usage')));
    expect(lintRule({ file: 'p2-digest.json', groupName: 'pawpi-p2-digest', rule: usage, contract })).toEqual([]);
    usage.data[0].model.expr = 'max(grafanacloud_org_secret_metric)';
    expect(lintRule({ file: 'p2-digest.json', groupName: 'pawpi-p2-digest', rule: usage, contract }).join()).toMatch(/usage metric "grafanacloud_org_secret_metric" is not in the allow-list/);
    usage.data[0].model.expr = 'max by (id) (grafanacloud_instance_active_series)';
    expect(lintRule({ file: 'p2-digest.json', groupName: 'pawpi-p2-digest', rule: usage, contract }).join()).toMatch(/usage queries must not group by labels/);
  });

  it('data[] structure: condition, expressions, thresholds', () => {
    expect(lint((r) => { r.condition = 'Z'; })).toMatch(/condition "Z" is not a refId/);
    expect(lint((r) => { r.data[1].model.expression = 'Q'; })).toMatch(/refers to unknown refId "Q"/);
    expect(lint((r) => { r.data[2].model.conditions[0].evaluator.params = ['five']; })).toMatch(/needs a numeric evaluator/);
    expect(lint((r) => { r.data[1].refId = 'A'; })).toMatch(/missing\/duplicate refId/);
    expect(lint((r) => { r.data = []; })).toMatch(/data\[\] is empty/);
    expect(lint((r) => { r.data[0].relativeTimeRange = { from: 0, to: 0 }; })).toMatch(/invalid relativeTimeRange/);
  });

  it('file level: unknown tier file, wrong folder, duplicates', () => {
    const doc = JSON.parse(JSON.stringify(entries[0].doc));
    expect(lintAlertFile({ file: 'p3-whatever.json', doc, contract }).join()).toMatch(/unknown tier file/);
    doc.groups[0].folder = 'General';
    expect(lintAlertFile({ file: 'p1-critical.json', doc, contract }).join()).toMatch(/folder must be "PawPi"/);
    expect(lintAlerts([entries[0], entries[0]], { contract }).join()).toMatch(/duplicate rule uid/);
    expect(lintAlertFile({ file: 'p1-critical.json', doc: { apiVersion: 2, groups: [] }, contract }).join()).toMatch(/apiVersion must be 1/);
  });
});
