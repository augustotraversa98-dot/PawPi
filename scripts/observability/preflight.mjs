#!/usr/bin/env node
// PawPi observability night-run PREFLIGHT (docs/observability/night-run/00-PREFLIGHT.md).
// Node >= 18, zero dependencies. Prints a PASS / WARN / FAIL table; NEVER prints secret values
// (env var names + booleans only). Exit code 1 on any FAIL.
//
// Everything it creates in Grafana is throwaway, reversible, and namespaced ("PawPi (preflight)").
// Nothing in production is changed. Run it in the SAME environment the night run will use.
//
//   node scripts/observability/preflight.mjs [--json] [--skip-repo-tests]

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node >= 22.21 / 24). In the
// Claude Code cloud environment ALL egress goes through that proxy, so re-exec once with it enabled.
if (!process.env.__PF_REEXEC && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, __PF_REEXEC: '1', NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status ?? 1);
}

const ARGS = new Set(process.argv.slice(2));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TIMEOUT_MS = 20000;
const PROD = 'https://www.pawpi.info';
const E = process.env;

/* ---------------------------------------------------------------- result table */
const rows = []; // { id, status, name, detail }
const fixes = []; // { id, text }
function add(id, status, name, detail = '') {
  rows.push({ id, status, name, detail: String(detail) });
}
function fix(id, text) {
  fixes.push({ id, text });
}

/* ---------------------------------------------------------------- helpers */
const redactions = () =>
  [
    E.GRAFANA_SA_TOKEN, E.GRAFANA_LOKI_TOKEN, E.GRAFANA_SM_TOKEN, E.ALERT_WEBHOOK_SECRET,
    E.GITHUB_DISPATCH_TOKEN, E.GH_TOKEN, E.GITHUB_TOKEN, E.OTEL_EXPORTER_OTLP_HEADERS,
  ].filter((s) => s && s.length > 6);
function scrub(s) {
  let out = String(s);
  for (const secret of redactions()) out = out.split(secret).join('«redacted»');
  // belt and braces: anything that looks like a bearer/basic credential or a glc_/glsa_/ghp_ token
  out = out.replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 «redacted»');
  out = out.replace(/\b(glc_|glsa_|ghp_|github_pat_|gho_)[A-Za-z0-9_]{8,}/g, '$1«redacted»');
  return out;
}
function hostOf(u) {
  try { return new URL(u).host; } catch { return null; }
}
function errMsg(e) {
  const c = e?.cause;
  return scrub([e?.name, e?.message, c && (c.code || c.message)].filter(Boolean).join(': '));
}
async function req(url, { method = 'GET', headers = {}, body, timeout = TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, headers, body, signal: ctl.signal, redirect: 'manual' });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { ok: r.ok, status: r.status, text, json, headers: r.headers };
  } catch (e) {
    // proxy policy denial surfaces as a connect failure
    return { ok: false, status: 0, error: errMsg(e), text: '', json: null };
  } finally {
    clearTimeout(t);
  }
}
const grafanaBase = () => (E.GRAFANA_URL || '').replace(/\/+$/, '');
const gHeaders = (extra = {}) => ({
  Authorization: `Bearer ${E.GRAFANA_SA_TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...extra,
});
const gReq = (p, o = {}) => req(grafanaBase() + p, { ...o, headers: gHeaders(o.headers) });
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout ?? 120000, cwd: opts.cwd ?? ROOT, env: { ...E, ...(opts.env || {}) } });
  return { code: r.status, out: scrub((r.stdout || '') + (r.stderr || '')), missing: r.error?.code === 'ENOENT' };
}
const NOW = Date.now();
const STAMP = new Date(NOW).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const HAVE_GRAFANA = () => !!(E.GRAFANA_URL && E.GRAFANA_SA_TOKEN);

/* ---------------------------------------------------------------- A. env var names */
function checkA() {
  const required = [
    'GRAFANA_URL', 'GRAFANA_SA_TOKEN', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS',
    'GRAFANA_LOKI_URL', 'GRAFANA_LOKI_USER', 'GRAFANA_LOKI_TOKEN', 'ALERT_WEBHOOK_SECRET', 'GITHUB_DISPATCH_TOKEN',
  ];
  const optional = ['GRAFANA_SM_URL', 'GRAFANA_SM_TOKEN'];
  const missing = required.filter((n) => !E[n]);
  const present = required.filter((n) => E[n]);
  add('A', missing.length ? 'FAIL' : 'PASS', 'Required env vars (names only)',
    `present: ${present.join(', ') || '-'} | MISSING: ${missing.join(', ') || '-'}`);
  const missOpt = optional.filter((n) => !E[n]);
  add('A', missOpt.length ? 'WARN' : 'PASS', 'Optional env vars (Synthetic Monitoring)',
    missOpt.length ? `missing: ${missOpt.join(', ')}` : 'both present');
  const grafanaMissing = missing.filter((n) => n.startsWith('GRAFANA_') || n.startsWith('OTEL_'));
  if (grafanaMissing.length)
    fix('A',
      `Set ${grafanaMissing.join(', ')} in the Claude Code cloud environment's variables (never in chat/repo).\n` +
      `   • GRAFANA_SA_TOKEN: Grafana Cloud -> your stack -> Administration -> Users and access -> Service accounts -> add account (role Admin) -> add token. Also set GRAFANA_URL (https://<stack>.grafana.net).\n` +
      `   • Loki/OTLP values: Grafana Cloud portal -> your stack -> Details -> Loki and OpenTelemetry sections (URL, user id, token with logs:write / metrics:write).`);
  const other = missing.filter((n) => !n.startsWith('GRAFANA_') && !n.startsWith('OTEL_'));
  if (other.length)
    fix('A', `Set ${other.join(', ')} in the Claude Code cloud environment's variables (same values as Railway; see docs/observability/OPERATIONS.md §2).`);
}

/* ---------------------------------------------------------------- B. network */
async function checkB() {
  const targets = [
    ['GRAFANA_URL', E.GRAFANA_URL],
    ['OTLP endpoint', E.OTEL_EXPORTER_OTLP_ENDPOINT],
    ['Loki', E.GRAFANA_LOKI_URL],
    ['api.github.com', 'https://api.github.com/'],
    ['pawpi.info social-enabled', `${PROD}/api/auth/social-enabled`],
  ];
  const blocked = new Set();
  for (const [label, url] of targets) {
    if (!url) {
      add('B', 'FAIL', `Reach ${label}`, 'env var not set -> cannot test (host unknown)');
      continue;
    }
    const host = hostOf(url);
    const r = await req(url, { timeout: 15000 });
    if (r.status > 0) add('B', 'PASS', `Reach ${label}`, `${host} -> HTTP ${r.status}`);
    else {
      add('B', 'FAIL', `Reach ${label}`, `${host} -> ${r.error}`);
      blocked.add(host);
    }
  }
  if (blocked.size) {
    const hosts = [...blocked];
    const wild = new Set(hosts.map((h) => (h.endsWith('.grafana.net') ? '*.grafana.net' : h)));
    fix('B',
      `Network blocked from this environment. Claude Code environment settings -> network access -> allow: ${[...wild].join(', ')}\n` +
      `   (blocked hostnames seen: ${hosts.join(', ')}).`);
  }
}

/* ---------------------------------------------------------------- C..F, J. Grafana API */
const G = { ok: false, role: null, prom: null, loki: null, dsList: [], folderUid: null };

async function checkC() {
  if (!HAVE_GRAFANA()) {
    add('C', 'FAIL', 'Grafana API (health / token / datasources)', 'GRAFANA_URL and/or GRAFANA_SA_TOKEN not set -> skipped');
    return;
  }
  const h = await req(grafanaBase() + '/api/health');
  if (h.status !== 200) {
    add('C', 'FAIL', 'GET /api/health', h.status ? `HTTP ${h.status}` : h.error);
    return;
  }
  add('C', 'PASS', 'GET /api/health', `HTTP 200 (database=${h.json?.database ?? '?'})`);
  // Identify the token. SA tokens are usable as a user via /api/user; org role via /api/org.
  const me = await gReq('/api/user');
  if (me.status === 200) {
    const org = await gReq('/api/org');
    const cur = await gReq('/api/user/orgs');
    const role = Array.isArray(cur.json) ? cur.json.find((o) => o.orgId === org.json?.id)?.role : undefined;
    G.role = role || null;
    add('C', role === 'Admin' ? 'PASS' : role === 'Editor' ? 'WARN' : 'FAIL', 'Token identity + role',
      `login=${me.json?.login ?? '?'} service_account=${me.json?.isServiceAccount ?? '?'} org=${org.json?.name ?? '?'} role=${role ?? 'unknown'}`);
    if (role !== 'Admin') fix('C', 'Token role is not Admin (alert provisioning + contact points need it): re-create the service account with role Admin.');
  } else {
    add('C', 'FAIL', 'Token identity + role', `GET /api/user -> HTTP ${me.status} (token rejected or expired)`);
    fix('C', 'GRAFANA_SA_TOKEN is rejected by Grafana: create a new Admin service-account token and update the environment variable.');
    return;
  }
  const ds = await gReq('/api/datasources');
  if (ds.status !== 200 || !Array.isArray(ds.json)) {
    add('C', 'FAIL', 'List datasources', `HTTP ${ds.status}`);
    return;
  }
  G.dsList = ds.json;
  G.prom = ds.json.find((d) => d.type === 'prometheus' && /prom/i.test(d.name) && !/usage|ml-metrics|alert/i.test(d.name)) ||
    ds.json.find((d) => d.type === 'prometheus' && d.isDefault) || ds.json.find((d) => d.type === 'prometheus');
  G.loki = ds.json.find((d) => d.type === 'loki' && !/usage|alert/i.test(d.name)) || ds.json.find((d) => d.type === 'loki');
  add('C', G.prom && G.loki ? 'PASS' : 'FAIL', 'Datasources (Prometheus + Loki uids)',
    `prometheus=${G.prom ? `${G.prom.name} uid=${G.prom.uid}` : 'NOT FOUND'} | loki=${G.loki ? `${G.loki.name} uid=${G.loki.uid}` : 'NOT FOUND'}`);
  G.ok = true;
}

async function checkD() {
  if (!G.ok) { add('D', 'FAIL', 'Reversible dashboard write test', 'skipped: Grafana API not usable (see C)'); return; }
  const folderTitle = 'PawPi (preflight)';
  let folderUid = null;
  let dashUid = null;
  const cleanup = [];
  try {
    // reuse a leftover folder from a crashed earlier run rather than failing on the name clash
    const existing = await gReq('/api/folders?limit=1000');
    const left = Array.isArray(existing.json) ? existing.json.find((f) => f.title === folderTitle) : null;
    if (left) folderUid = left.uid;
    else {
      const f = await gReq('/api/folders', { method: 'POST', body: JSON.stringify({ title: folderTitle }) });
      if (f.status !== 200) { add('D', 'FAIL', 'Create folder "PawPi (preflight)"', `HTTP ${f.status} ${scrub(f.text).slice(0, 160)}`); fix('D', 'Token cannot create folders: use an Admin service-account token.'); return; }
      folderUid = f.json.uid;
    }
    G.folderUid = folderUid;
    add('D', 'PASS', 'Create folder "PawPi (preflight)"', `uid=${folderUid}`);
    dashUid = `pawpi-preflight-${STAMP}`;
    const d = await gReq('/api/dashboards/db', {
      method: 'POST',
      body: JSON.stringify({ dashboard: { uid: dashUid, title: `pawpi-preflight ${STAMP}`, tags: ['pawpi-preflight'], panels: [], schemaVersion: 39 }, folderUid, overwrite: false, message: 'preflight' }),
    });
    if (d.status !== 200) { add('D', 'FAIL', 'Create throwaway dashboard', `HTTP ${d.status} ${scrub(d.text).slice(0, 160)}`); return; }
    add('D', 'PASS', 'Create throwaway dashboard', `uid=${dashUid}`);
    const rb = await gReq(`/api/dashboards/uid/${dashUid}`);
    add('D', rb.status === 200 && rb.json?.meta?.folderUid === folderUid ? 'PASS' : 'FAIL', 'Read dashboard back', `HTTP ${rb.status}, in preflight folder=${rb.json?.meta?.folderUid === folderUid}`);
  } finally {
    if (dashUid) {
      const del = await gReq(`/api/dashboards/uid/${dashUid}`, { method: 'DELETE' });
      add('D', del.status === 200 ? 'PASS' : 'FAIL', 'Delete throwaway dashboard', `HTTP ${del.status}`);
    }
    // folder deletion is deferred to the end of E (the throwaway alert rule lives in it)
  }
}

async function checkE() {
  if (!G.ok) { add('E', 'FAIL', 'Alerting provisioning', 'skipped: Grafana API not usable (see C)'); return; }
  const rules = await gReq('/api/v1/provisioning/alert-rules');
  add('E', rules.status === 200 ? 'PASS' : 'FAIL', 'List alert rules', rules.status === 200 ? `${rules.json.length} rule(s): ${rules.json.map((r) => r.title).slice(0, 10).join(', ') || '-'}` : `HTTP ${rules.status}`);
  const cps = await gReq('/api/v1/provisioning/contact-points');
  add('E', cps.status === 200 ? 'PASS' : 'FAIL', 'List contact points', cps.status === 200 ? `${cps.json.length}: ${[...new Set(cps.json.map((c) => `${c.name}(${c.type})`))].join(', ') || '-'}` : `HTTP ${cps.status}`);
  const pol = await gReq('/api/v1/provisioning/policies');
  add('E', pol.status === 200 ? 'PASS' : 'FAIL', 'Read notification policies', pol.status === 200 ? `root receiver=${pol.json?.receiver ?? '?'}, ${pol.json?.routes?.length ?? 0} child route(s)` : `HTTP ${pol.status}`);

  if (!G.folderUid || !G.prom) {
    add('E', 'FAIL', 'Throwaway PAUSED alert rule', 'skipped: no preflight folder or no Prometheus datasource (see C/D)');
  } else {
    const uid = `pawpi-preflight-rule-${STAMP}`;
    const body = {
      uid, title: `pawpi-preflight ${STAMP}`, ruleGroup: 'pawpi-preflight', folderUID: G.folderUid,
      condition: 'C', orgID: 1, noDataState: 'OK', execErrState: 'OK', for: '5m', isPaused: true,
      annotations: { summary: 'preflight throwaway - safe to delete' }, labels: { preflight: 'true' },
      data: [
        { refId: 'A', relativeTimeRange: { from: 600, to: 0 }, datasourceUid: G.prom.uid, model: { refId: 'A', expr: 'vector(0)', instant: true, intervalMs: 1000, maxDataPoints: 43200 } },
        { refId: 'B', relativeTimeRange: { from: 0, to: 0 }, datasourceUid: '__expr__', model: { refId: 'B', type: 'reduce', expression: 'A', reducer: 'last', settings: { mode: 'dropNN' } } },
        { refId: 'C', relativeTimeRange: { from: 0, to: 0 }, datasourceUid: '__expr__', model: { refId: 'C', type: 'threshold', expression: 'B', conditions: [{ evaluator: { type: 'gt', params: [1] } }] } },
      ],
    };
    const c = await gReq('/api/v1/provisioning/alert-rules', { method: 'POST', headers: { 'X-Disable-Provenance': 'true' }, body: JSON.stringify(body) });
    if (c.status !== 201 && c.status !== 200) {
      add('E', 'FAIL', 'Create PAUSED throwaway alert rule', `HTTP ${c.status} ${scrub(c.text).slice(0, 200)}`);
      fix('E', 'Token cannot write alert rules: use an Admin service-account token (alert rules + contact points need Admin).');
    } else {
      add('E', 'PASS', 'Create PAUSED throwaway alert rule', `uid=${uid}`);
      const rb = await gReq(`/api/v1/provisioning/alert-rules/${uid}`);
      add('E', rb.status === 200 && rb.json?.isPaused === true ? 'PASS' : 'FAIL', 'Read rule back (still paused)', `HTTP ${rb.status}, isPaused=${rb.json?.isPaused}`);
      const del = await gReq(`/api/v1/provisioning/alert-rules/${uid}`, { method: 'DELETE' });
      add('E', del.status === 204 || del.status === 200 ? 'PASS' : 'FAIL', 'Delete throwaway alert rule', `HTTP ${del.status}`);
    }
  }
  if (G.folderUid) {
    const del = await gReq(`/api/folders/${G.folderUid}?forceDeleteRules=true`, { method: 'DELETE' });
    add('E', del.status === 200 ? 'PASS' : 'FAIL', 'Delete folder "PawPi (preflight)"', `HTTP ${del.status}`);
  }
}

async function promQuery(expr) {
  const uid = G.prom.uid;
  return gReq(`/api/datasources/proxy/uid/${uid}/api/v1/query?query=${encodeURIComponent(expr)}`);
}

async function checkF() {
  if (!G.ok || !G.prom) { add('F', 'FAIL', 'Existing pawpi_* series (informational)', 'skipped: no Prometheus datasource (see C)'); return; }
  const r = await promQuery('count({__name__=~"pawpi_.*"})');
  if (r.status !== 200) { add('F', 'WARN', 'Existing pawpi_* series (informational)', `HTTP ${r.status}`); return; }
  const v = r.json?.data?.result?.[0]?.value?.[1];
  add('F', 'PASS', 'Existing pawpi_* series (informational)', `${v ?? 0} series today`);
}

async function checkG() {
  const have = E.GRAFANA_LOKI_URL && E.GRAFANA_LOKI_USER && E.GRAFANA_LOKI_TOKEN;
  if (!have) { add('G', 'FAIL', 'Loki push + query back', 'GRAFANA_LOKI_URL / _USER / _TOKEN not set -> skipped'); return; }
  const base = E.GRAFANA_LOKI_URL.replace(/\/+$/, '').replace(/\/loki\/api\/v1\/push$/, '');
  const auth = 'Basic ' + Buffer.from(`${E.GRAFANA_LOKI_USER}:${E.GRAFANA_LOKI_TOKEN}`).toString('base64');
  const marker = `pawpi-preflight ${STAMP} ${Math.random().toString(36).slice(2, 8)}`;
  const ns = String(BigInt(Date.now()) * 1000000n);
  const push = await req(`${base}/loki/api/v1/push`, {
    method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ streams: [{ stream: { job: 'pawpi-preflight' }, values: [[ns, marker]] }] }),
  });
  if (push.status !== 204 && push.status !== 200) {
    add('G', 'FAIL', 'Loki push', `HTTP ${push.status || push.error}`);
    if (push.status === 401 || push.status === 403) fix('G', 'Loki credentials rejected: regenerate GRAFANA_LOKI_TOKEN with logs:write scope and check GRAFANA_LOKI_USER (numeric user id).');
    return;
  }
  add('G', 'PASS', 'Loki push', `HTTP ${push.status}`);
  // read back: prefer the Grafana datasource proxy (what dashboards use); fall back to direct query
  let found = false, how = '';
  for (let i = 0; i < 6 && !found; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const q = `{job="pawpi-preflight"}`;
    const start = String(BigInt(Date.now() - 600000) * 1000000n);
    let r;
    if (G.ok && G.loki) { r = await gReq(`/api/datasources/proxy/uid/${G.loki.uid}/loki/api/v1/query_range?query=${encodeURIComponent(q)}&start=${start}&limit=20`); how = 'via Grafana datasource'; }
    else { r = await req(`${base}/loki/api/v1/query_range?query=${encodeURIComponent(q)}&start=${start}&limit=20`, { headers: { Authorization: auth } }); how = 'direct (read scope)'; }
    found = r.status === 200 && JSON.stringify(r.json?.data?.result ?? []).includes(marker);
  }
  add('G', found ? 'PASS' : 'FAIL', 'Loki query back', found ? how : `marker not found after ~15s (${how || 'no query path'})`);
}

async function checkH() {
  const ep = E.OTEL_EXPORTER_OTLP_ENDPOINT, hdr = E.OTEL_EXPORTER_OTLP_HEADERS;
  if (!ep || !hdr) { add('H', 'FAIL', 'OTLP authenticated empty request', 'OTEL_EXPORTER_OTLP_ENDPOINT / _HEADERS not set -> skipped'); return; }
  // OTEL headers format: k1=v1,k2=v2 (values may be url-encoded, e.g. "Authorization=Basic%20xxx")
  const headers = { 'Content-Type': 'application/json' };
  for (const part of hdr.split(',')) {
    const i = part.indexOf('=');
    if (i > 0) { try { headers[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { headers[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } }
  }
  const r = await req(ep.replace(/\/+$/, '') + '/v1/metrics', { method: 'POST', headers, body: JSON.stringify({ resourceMetrics: [] }) });
  if (r.status === 401 || r.status === 403) {
    add('H', 'FAIL', 'OTLP authenticated empty request', `HTTP ${r.status} (auth rejected)`);
    fix('H', 'OTLP credentials rejected: Grafana Cloud portal -> stack -> Details -> OpenTelemetry -> generate a token with metrics:write and put the header in OTEL_EXPORTER_OTLP_HEADERS (Authorization=Basic <base64 instanceId:token>).');
  } else if (r.status >= 200 && r.status < 300) add('H', 'PASS', 'OTLP authenticated empty request', `HTTP ${r.status}`);
  else add('H', 'WARN', 'OTLP authenticated empty request', r.status ? `HTTP ${r.status}` : r.error);
}

async function checkI() {
  if (!E.GRAFANA_SM_TOKEN) { add('I', 'WARN', 'Synthetic Monitoring (optional)', 'GRAFANA_SM_TOKEN not set -> SM steps would be skipped'); return; }
  const base = (E.GRAFANA_SM_URL || 'https://synthetic-monitoring-api.grafana.net').replace(/\/+$/, '');
  const r = await req(`${base}/api/v1/check/list`, { headers: { Authorization: `Bearer ${E.GRAFANA_SM_TOKEN}` } });
  if (r.status === 200 && Array.isArray(r.json)) add('I', 'PASS', 'Synthetic Monitoring (optional)', `${r.json.length} check(s)`);
  else add('I', 'WARN', 'Synthetic Monitoring (optional)', r.status ? `HTTP ${r.status}` : r.error);
}

async function checkJ() {
  if (!G.ok) { add('J', 'WARN', 'Free-tier headroom', 'skipped: Grafana API not usable (see C)'); return; }
  const usageDs = G.dsList.find((d) => d.type === 'prometheus' && /usage/i.test(d.name));
  if (!usageDs) { add('J', 'WARN', 'Free-tier headroom', 'grafanacloud usage datasource not found -> check usage in the Grafana Cloud portal (Usage tab)'); return; }
  const q = async (expr) => {
    const r = await gReq(`/api/datasources/proxy/uid/${usageDs.uid}/api/v1/query?query=${encodeURIComponent(expr)}`);
    const v = Number(r.json?.data?.result?.[0]?.value?.[1]);
    return Number.isFinite(v) ? v : null;
  };
  const series = await q('grafanacloud_instance_active_series');
  const seriesLimit = await q('grafanacloud_instance_max_active_series_limit') ?? await q('max(grafanacloud_org_metrics_included_series)') ;
  const logGb = await q('grafanacloud_logs_instance_usage_per_user_bytes') ;
  const parts = [];
  let status = 'PASS';
  if (series != null) {
    const lim = seriesLimit ?? 10000;
    const pct = (100 * series) / lim;
    parts.push(`active series ${Math.round(series)}/${Math.round(lim)} (${pct.toFixed(0)}%${seriesLimit ? '' : ', assumed free-tier 10k limit'})`);
    if (pct > 70) status = 'WARN';
  }
  if (logGb != null) parts.push(`log usage metric present`);
  if (!parts.length) { add('J', 'WARN', 'Free-tier headroom', 'usage datasource found but usage metrics not queryable'); return; }
  add('J', status, 'Free-tier headroom', parts.join(' | '));
}

/* ---------------------------------------------------------------- K, M, O. GitHub */
function ghRepoSlug() {
  const r = sh('git', ['remote', 'get-url', 'origin']);
  const m = r.out.trim().match(/github\.com[:/]+([^/]+)\/([^/.\s]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}
let GH_AUTH_OK = false;

async function checkK() {
  const ver = sh('gh', ['--version']);
  if (ver.missing) { add('K', 'FAIL', 'gh CLI installed', 'gh not found on PATH'); fix('K', 'Install the GitHub CLI (gh) in the environment setup script.'); return; }
  const st = sh('gh', ['auth', 'status']);
  GH_AUTH_OK = st.code === 0;
  add('K', GH_AUTH_OK ? 'PASS' : 'FAIL', '`gh auth status`', GH_AUTH_OK ? 'authenticated' : scrub(st.out).replace(/\s+/g, ' ').slice(0, 220));
  if (!GH_AUTH_OK)
    fix('K', 'gh is not authenticated (the token in GH_TOKEN is invalid/expired, or absent). Create a fine-grained PAT for this repo (Contents RW, Pull requests RW, Actions R, Metadata R, Administration R for branch-protection reads) and set it as GH_TOKEN in the Claude Code environment variables; or connect GitHub for the session at https://claude.ai/connect-github.');
  const slug = ghRepoSlug();
  // git push --dry-run (needs only git creds, so it also works when gh is broken)
  const branch = sh('git', ['branch', '--show-current']).out.trim() || 'HEAD';
  const dry = sh('git', ['push', '--dry-run', 'origin', `HEAD:refs/heads/preflight-dryrun-${STAMP}`], { timeout: 60000 });
  add('K', dry.code === 0 ? 'PASS' : 'FAIL', 'Can push a branch (`git push --dry-run`)', dry.code === 0 ? `ok (from ${branch})` : dry.out.replace(/\s+/g, ' ').slice(0, 220));
  if (dry.code !== 0) fix('K', 'git push is not permitted from this environment: grant the session/PAT write access (Contents: Read and write) to ' + (slug || 'the repo') + '.');
  if (GH_AUTH_OK && slug) {
    const prs = sh('gh', ['pr', 'list', '--repo', slug, '--limit', '3', '--state', 'all', '--json', 'number,title,state']);
    add('K', prs.code === 0 ? 'PASS' : 'FAIL', 'Can list PRs (`gh pr list`)', prs.code === 0 ? 'ok' : prs.out.replace(/\s+/g, ' ').slice(0, 160));
  } else add('K', 'FAIL', 'Can list PRs (`gh pr list`)', 'skipped: gh not authenticated');
  // CI workflow names present in the repo
  const wfDir = path.join(ROOT, '.github', 'workflows');
  let names = [];
  try {
    for (const f of fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))) {
      const txt = fs.readFileSync(path.join(wfDir, f), 'utf8');
      const wf = txt.match(/^name:\s*(.+)$/m)?.[1]?.trim();
      const jobs = [...txt.matchAll(/^\s{4}name:\s*(.+)$/gm)].map((m) => m[1].trim());
      names.push(`${f}[${wf ?? '?'}${jobs.length ? ': ' + jobs.join(' / ') : ''}]`);
    }
  } catch { /* none */ }
  add('K', names.some((n) => n.startsWith('ci.yml')) ? 'PASS' : 'FAIL', 'CI workflow names present', names.join('; ') || 'no workflows found');
}

async function checkM() {
  if (!GH_AUTH_OK) { add('M', 'FAIL', 'GitHub merge capability + branch protection', 'skipped: gh not authenticated (see K)'); return; }
  const slug = ghRepoSlug();
  const perm = sh('gh', ['api', `repos/${slug}`, '--jq', '{perms: .permissions, default: .default_branch, squash: .allow_squash_merge, auto: .allow_auto_merge, delete_branch: .delete_branch_on_merge}']);
  if (perm.code !== 0) { add('M', 'FAIL', 'GitHub merge capability', perm.out.replace(/\s+/g, ' ').slice(0, 200)); return; }
  let p = {}; try { p = JSON.parse(perm.out); } catch { /* ignore */ }
  const canPush = !!(p.perms?.push || p.perms?.maintain || p.perms?.admin);
  add('M', canPush ? 'PASS' : 'FAIL', 'Token has push/maintain', `permissions=${JSON.stringify(p.perms ?? {})}`);
  add('M', p.squash === false ? 'FAIL' : 'PASS', 'Squash merge allowed on repo', `allow_squash_merge=${p.squash}`);
  if (!canPush) fix('M', 'Token lacks push/maintain on ' + slug + ' -> cannot merge: use a PAT with write access.');
  const def = p.default || 'main';
  const bp = sh('gh', ['api', `repos/${slug}/branches/${def}/protection`]);
  if (bp.code !== 0) {
    if (/Branch not protected|404/i.test(bp.out)) add('M', 'WARN', `Branch protection on ${def}`, 'none configured -> merge is not blocked, but nothing enforces green CI either; the run itself must gate on `gh pr checks`');
    else if (/403|Resource not accessible|Upgrade|admin/i.test(bp.out)) add('M', 'WARN', `Branch protection on ${def}`, 'cannot read (token lacks Administration:read) -> unknown whether reviews are required; also check rulesets below');
    else add('M', 'WARN', `Branch protection on ${def}`, bp.out.replace(/\s+/g, ' ').slice(0, 200));
  } else {
    let b = {}; try { b = JSON.parse(bp.out); } catch { /* ignore */ }
    const reviews = b.required_pull_request_reviews;
    const n = reviews?.required_approving_review_count ?? 0;
    const checks = b.required_status_checks?.contexts?.length ? b.required_status_checks.contexts : (b.required_status_checks?.checks || []).map((c) => c.context);
    const enforceAdmins = b.enforce_admins?.enabled;
    add('M', 'PASS', `Required status checks on ${def}`, checks?.length ? checks.join(', ') : 'none');
    if (n > 0 || reviews?.require_code_owner_reviews) {
      // a self-merge only works if the token is admin AND admins are not enforced, or bypass is allowed
      const canBypass = p.perms?.admin && !enforceAdmins;
      add('M', canBypass ? 'WARN' : 'FAIL', `Required reviews on ${def}`, `required_approving_review_count=${n}, code_owner_reviews=${!!reviews?.require_code_owner_reviews}, enforce_admins=${!!enforceAdmins}${canBypass ? ' (admin token could bypass; still not clean)' : ' -> a bot cannot self-merge'}`);
      if (!canBypass) fix('M', `Branch protection on ${def} requires ${n} approving review(s): the unattended run cannot self-merge. Either set required approvals to 0 for the night, or add the bot/PAT owner as a bypass actor, or accept that PRs stay open for morning merge.`);
    } else add('M', 'PASS', `Required reviews on ${def}`, 'none required -> self-merge not blocked');
  }
  const rs = sh('gh', ['api', `repos/${slug}/rulesets`]);
  if (rs.code === 0) {
    let arr = []; try { arr = JSON.parse(rs.out); } catch { /* ignore */ }
    add('M', arr.length ? 'WARN' : 'PASS', 'Repository rulesets', arr.length ? `${arr.length} ruleset(s): ${arr.map((r) => `${r.name}(${r.enforcement})`).join(', ')} -> inspect for required reviews` : 'none');
  }
}

async function checkO() {
  if (!GH_AUTH_OK) { add('O', 'FAIL', '`gh pr checks` on an existing PR', 'skipped: gh not authenticated (see K)'); return; }
  const slug = ghRepoSlug();
  const list = sh('gh', ['pr', 'list', '--repo', slug, '--state', 'all', '--limit', '1', '--json', 'number']);
  let n = null; try { n = JSON.parse(list.out)?.[0]?.number; } catch { /* ignore */ }
  if (!n) { add('O', 'FAIL', '`gh pr checks` on an existing PR', 'no PR found to test against'); return; }
  const r = sh('gh', ['pr', 'checks', String(n), '--repo', slug]);
  // exit 0 = all pass, 1 = failures, 8 = pending; all of them mean the command WORKS. Anything else = broken.
  const works = [0, 1, 8].includes(r.code) && !/error|could not|HTTP 4\d\d/i.test(r.out.split('\n')[0] || '');
  add('O', works ? 'PASS' : 'FAIL', '`gh pr checks` on an existing PR', works ? `PR #${n} -> exit ${r.code}` : r.out.replace(/\s+/g, ' ').slice(0, 200));
}

/* ---------------------------------------------------------------- N. production smoke endpoints */
async function checkN() {
  const probe = await req(`${PROD}/api/auth/social-enabled`, { timeout: 15000 });
  if (probe.status === 0) {
    add('N', 'FAIL', 'Production smoke endpoints', `unreachable: ${hostOf(PROD)} -> ${probe.error}`);
    fix('N', `The night run verifies every deploy against ${hostOf(PROD)} (smoke checks + /api/health/deep). Allow ${hostOf(PROD)} (and pawpi.info) in the Claude Code environment's network access, otherwise auto-merge cannot verify production and MUST NOT run.`);
    return;
  }
  const so = probe;
  const okSocial = so.status === 200 && so.json?.google === true && so.json?.apple === true;
  add('N', okSocial ? 'PASS' : 'FAIL', '/api/auth/social-enabled == {google:true,apple:true}', `HTTP ${so.status}, google=${so.json?.google}, apple=${so.json?.apple}`);
  const pv = await req(`${PROD}/api/auth/providers`);
  add('N', pv.status === 200 && pv.json && 'google' in pv.json ? 'PASS' : 'FAIL', '/api/auth/providers lists google', `HTTP ${pv.status}, providers=${pv.json ? Object.keys(pv.json).join(',') : '-'}`);
  for (const p of ['/account/signin', '/account/signup']) {
    const r = await req(PROD + p);
    const soon = /coming soon/i.test(r.text);
    add('N', r.status === 200 ? (soon ? 'WARN' : 'PASS') : 'FAIL', `${p} returns 200`, `HTTP ${r.status}${soon ? ' (contains "Coming soon")' : ''}`);
  }
  const se = await req(`${PROD}/api/auth/session`);
  add('N', se.status === 200 ? 'PASS' : 'FAIL', '/api/auth/session returns 200', `HTTP ${se.status}`);
  const hd = await req(`${PROD}/api/health/deep`);
  add('N', hd.status === 200 ? 'PASS' : 'WARN', '/api/health/deep (informational: 404 until step A ships)', `HTTP ${hd.status}`);
}

/* ---------------------------------------------------------------- L. repo */
function checkL() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add('L', nodeMajor >= 18 ? 'PASS' : 'FAIL', 'node version', `node ${process.versions.node}, npm ${sh('npm', ['-v']).out.trim()}`);
  const bun = sh('bun', ['--version']);
  add('L', bun.missing ? 'WARN' : 'PASS', 'bun (web lockfile manager)', bun.missing ? 'bun not found (CI uses bun install --frozen-lockfile for web)' : `bun ${bun.out.trim()}`);
  const apps = [
    { name: 'web', dir: 'anything/apps/web', unit: 'test', integ: 'test:integration' },
    { name: 'mobile', dir: 'anything/apps/mobile', unit: 'test', integ: null },
  ];
  for (const a of apps) {
    const dir = path.join(ROOT, a.dir);
    let pkg; try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { add('L', 'FAIL', `${a.name} package.json`, 'missing'); continue; }
    add('L', pkg.scripts?.[a.unit] ? 'PASS' : 'FAIL', `${a.name}: \`npm run ${a.unit}\` exists`, pkg.scripts?.[a.unit] ?? '-');
    if (a.integ) add('L', pkg.scripts?.[a.integ] ? 'PASS' : 'FAIL', `${a.name}: \`npm run ${a.integ}\` exists`, pkg.scripts?.[a.integ] ?? '-');
    const nm = fs.existsSync(path.join(dir, 'node_modules'));
    if (ARGS.has('--skip-repo-tests')) { add('L', 'WARN', `${a.name}: install + start tests`, 'skipped (--skip-repo-tests)'); continue; }
    if (!nm) {
      const inst = a.name === 'web' && !bun.missing
        ? sh('bun', ['install', '--frozen-lockfile'], { cwd: dir, timeout: 600000 })
        : sh('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, timeout: 600000 });
      add('L', inst.code === 0 ? 'PASS' : 'FAIL', `${a.name}: dependency install`, inst.code === 0 ? 'ok' : inst.out.replace(/\s+/g, ' ').slice(-200));
      if (inst.code !== 0) {
        // name the exact host(s) the package manager was refused on, so the human fix is concrete
        const logPath = inst.out.match(/(\/\S+\/_logs\/\S+\.log)/)?.[1];
        let hosts = [];
        try { hosts = [...new Set([...fs.readFileSync(logPath, 'utf8').matchAll(/GET 403 https?:\/\/([^/\s]+)/g)].map((m) => m[1]))]; } catch { /* no log */ }
        if (hosts.length) fix('L', `${a.name}: dependency install is blocked by the network policy (HTTP 403 from: ${hosts.join(', ')}). Allow ${hosts.join(', ')} in the Claude Code environment's network access (this is a git-hosted dependency fetched from GitHub's tarball host), or the night run cannot run the mobile tests.`);
        else fix('L', `${a.name}: dependency install failed; see the detail above and re-run \`npm ci\` in ${a.dir}.`);
        continue;
      }
    } else add('L', 'PASS', `${a.name}: dependency install`, 'node_modules already present');
    // "starts": run one concrete test file / the whole fast suite with a bounded timeout
    const t = sh('npm', ['run', a.unit, '--silent'], { cwd: dir, timeout: 420000 });
    add('L', t.code === 0 ? 'PASS' : 'FAIL', `${a.name}: unit tests start + pass`, t.code === 0 ? (t.out.match(/Tests?\s+[^\n]*/)?.[0] ?? 'ok').trim() : t.out.replace(/\s+/g, ' ').slice(-220));
    if (a.integ) {
      // embedded-postgres boots a real server; prove the harness STARTS without running the whole (long) suite
      const it = sh('npm', ['run', a.integ, '--silent', '--', 'jsonb.integration'], { cwd: dir, timeout: 420000 });
      const smoke = it.code === 0 || /Test Files\s+\d+ (passed|failed)/.test(it.out);
      add('L', it.code === 0 ? 'PASS' : smoke ? 'WARN' : 'FAIL', `${a.name}: integration harness starts (embedded Postgres)`,
        it.code === 0 ? (it.out.match(/Tests?\s+[^\n]*/)?.[0] ?? 'ok').trim() : it.out.replace(/\s+/g, ' ').slice(-220));
    }
  }
}

/* ---------------------------------------------------------------- run + print */
async function main() {
  checkA();
  await checkB();
  await checkC();
  await checkD();
  await checkE();
  await checkF();
  await checkG();
  await checkH();
  await checkI();
  await checkJ();
  await checkK();
  checkL();
  await checkM();
  await checkN();
  await checkO();

  const order = 'ABCDEFGHIJKLMNO';
  rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  rows.forEach((r) => counts[r.status]++);
  const ready = counts.FAIL === 0;

  if (ARGS.has('--json')) {
    console.log(JSON.stringify({ date: new Date().toISOString(), counts, ready, rows, fixes }, null, 2));
  } else {
    const w = Math.max(...rows.map((r) => r.name.length), 10);
    console.log(`\nPawPi observability PREFLIGHT  ${new Date().toISOString()}\n`);
    console.log(`  #  STATUS  ${'CHECK'.padEnd(w)}  DETAIL`);
    for (const r of rows) console.log(`  ${r.id}  ${r.status.padEnd(6)}  ${r.name.padEnd(w)}  ${r.detail}`);
    console.log(`\n  PASS ${counts.PASS}   WARN ${counts.WARN}   FAIL ${counts.FAIL}`);
    if (fixes.length) {
      console.log('\n  WHAT THE HUMAN MUST FIX:');
      fixes.forEach((f, i) => console.log(`  ${i + 1}. [${f.id}] ${f.text}`));
    }
    console.log(`\nREADY FOR NIGHT RUN: ${ready ? 'YES' : 'NO'}`);
  }
  process.exit(ready ? 0 : 1);
}

main().catch((e) => {
  console.error('preflight crashed:', errMsg(e));
  process.exit(1);
});
