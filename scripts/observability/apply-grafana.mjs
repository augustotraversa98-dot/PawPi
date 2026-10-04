#!/usr/bin/env node
// Apply PawPi's Grafana objects from this repo (observability-as-code).  Node >= 18, ZERO dependencies.
//
//   GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=glsa_... node scripts/observability/apply-grafana.mjs
//       DRY RUN (default): prints a per-object plan (create / update / unchanged) against what is live. Writes NOTHING.
//   ... node scripts/observability/apply-grafana.mjs --apply
//       Writes through the Grafana HTTP API. Idempotent: a second run reports everything `unchanged`.
//   ... node scripts/observability/apply-grafana.mjs --sections all [--apply]
//       Also plans/applies alert rules, notification routing and Synthetic Monitoring checks (Step D).
//
// SECTIONS (--sections a,b,c | all; default `dashboards`, so the Step C command keeps meaning exactly what it did):
//   dashboards  observability/grafana/dashboards/*.json            -> /api/dashboards/db
//   alerts      observability/grafana/alerts/*.json                -> /api/v1/provisioning/alert-rules
//   policies    P1/P2 child routes in the notification policy tree + contact point `pawpi-digest`
//   synthetics  observability/grafana/synthetics/*.json            -> Synthetic Monitoring API (own URL + token)
//
// Flags: --apply, --sections <list>, --only <uid>[,<uid>] (repeatable; dashboard/rule uids, SM job names),
//        --dir <dashboards dir>, --alerts-dir <dir>, --synthetics-dir <dir>, --exit-code (dry run exits 4 when changes are
//        pending), --help.
// Env: GRAFANA_URL, GRAFANA_SA_TOKEN (Bearer service-account token), optional GRAFANA_PROM_DS / GRAFANA_LOKI_DS (datasource
//      name or uid to force, otherwise resolved by type+name), ALERT_DIGEST_EMAIL (P2 digest recipients, `;` or `,`
//      separated; without it the digest contact point + P2 route are skipped), GRAFANA_SM_URL + GRAFANA_SM_TOKEN
//      (Synthetic Monitoring; without both the synthetics section is a no-op).
//
// SAFETY (enforced in code, covered by tests):
//   * only objects whose uid starts with `pawpi-` are ever written; anything else is refused;
//   * NOTHING is ever deleted (the HTTP helper refuses DELETE outright);
//   * the existing folder "PawPi" is reused (found by title); only a missing one is created (uid `pawpi-folder`);
//   * the token is never printed (errors carry method + path + status only);
//   * datasources are resolved at runtime by type/name; repo files only carry ${DS_PROMETHEUS} / ${DS_LOKI} / ${DS_USAGE};
//   * ALERT PAUSE SEMANTICS: `isPaused: true` in the repo file (the default for every rule) means "created paused; an update
//     keeps the LIVE value" - re-applying never re-pauses and never un-pauses. `isPaused: false` is an EXPLICIT, reviewed
//     "resume this rule" declaration (a commit on main): the apply creates the rule active / resumes a paused one, and the dry
//     run shows it as an update until live matches. Pausing stays a UI action (the repo never forces a live rule back to paused);
//   * NOTIFICATION POLICIES are one shared tree: we GET it, add/refresh ONLY our two child routes (matchers
//     pawpi_managed="true" + severity P1|P2, placed in front so they win over a generic folder route), assert every other
//     route is byte-identical and in the same order, then PUT it back. Contact point `Augusto` is never written; only
//     `pawpi-digest` is created/updated. Provisioning writes send X-Disable-Provenance so everything stays editable in the UI.
//
// Exit codes: 0 ok | 1 usage / invalid repo files | 2 config missing (--apply without env) |
//             3 Grafana unreachable / rejected the request / datasource not found | 4 dry run with pending changes (--exit-code)
//
// EXTENDING: the script is a list of SECTIONS ({ name, plan(ctx), apply(ctx, plan), writeAllow, ... }); see `allSections`.
// The helpers (createHttp, ensureFolder, resolveDatasources, ...) are named exports.

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UID_PREFIX = 'pawpi-';
export const FOLDER_TITLE = 'PawPi';
export const FOLDER_UID = 'pawpi-folder';
export const PLACEHOLDERS = Object.freeze({ prometheus: '${DS_PROMETHEUS}', loki: '${DS_LOKI}', usage: '${DS_USAGE}' });
export const EXIT = Object.freeze({ OK: 0, USAGE: 1, CONFIG: 2, GRAFANA: 3, PENDING: 4 });

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DASHBOARD_DIR = path.resolve(HERE, '../../observability/grafana/dashboards');
export const DEFAULT_ALERTS_DIR = path.resolve(HERE, '../../observability/grafana/alerts');
export const DEFAULT_SYNTHETICS_DIR = path.resolve(HERE, '../../observability/grafana/synthetics');
export const SECTION_NAMES = Object.freeze(['dashboards', 'alerts', 'policies', 'synthetics']);

/** An error that carries the process exit code. */
export class ApplyError extends Error {
  constructor(message, code = EXIT.GRAFANA) {
    super(message);
    this.name = 'ApplyError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- args
export function parseArgs(argv) {
  const opts = {
    apply: false, only: [], dir: DEFAULT_DASHBOARD_DIR, alertsDir: DEFAULT_ALERTS_DIR, syntheticsDir: DEFAULT_SYNTHETICS_DIR,
    sections: ['dashboards'], exitCode: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--exit-code') opts.exitCode = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--only' || a.startsWith('--only=')) {
      const v = a === '--only' ? argv[++i] : a.slice('--only='.length);
      if (!v) throw new ApplyError('--only needs a dashboard uid (e.g. --only pawpi-overview)', EXIT.USAGE);
      opts.only.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--dir' || a.startsWith('--dir=')) {
      const v = a === '--dir' ? argv[++i] : a.slice('--dir='.length);
      if (!v) throw new ApplyError('--dir needs a directory', EXIT.USAGE);
      opts.dir = path.resolve(v);
    } else if (a === '--alerts-dir' || a.startsWith('--alerts-dir=')) {
      const v = a === '--alerts-dir' ? argv[++i] : a.slice('--alerts-dir='.length);
      if (!v) throw new ApplyError('--alerts-dir needs a directory', EXIT.USAGE);
      opts.alertsDir = path.resolve(v);
    } else if (a === '--synthetics-dir' || a.startsWith('--synthetics-dir=')) {
      const v = a === '--synthetics-dir' ? argv[++i] : a.slice('--synthetics-dir='.length);
      if (!v) throw new ApplyError('--synthetics-dir needs a directory', EXIT.USAGE);
      opts.syntheticsDir = path.resolve(v);
    } else if (a === '--sections' || a.startsWith('--sections=')) {
      const v = a === '--sections' ? argv[++i] : a.slice('--sections='.length);
      if (!v) throw new ApplyError(`--sections needs a list (${SECTION_NAMES.join(',')} or all)`, EXIT.USAGE);
      const names = v.split(',').map((x) => x.trim()).filter(Boolean);
      const list = names.includes('all') ? [...SECTION_NAMES] : names;
      const bad = list.filter((n) => !SECTION_NAMES.includes(n));
      if (bad.length || !list.length) throw new ApplyError(`unknown section "${bad.join(', ')}" (valid: ${SECTION_NAMES.join(', ')}, all)`, EXIT.USAGE);
      opts.sections = SECTION_NAMES.filter((n) => list.includes(n)); // canonical order
    } else throw new ApplyError(`unknown argument "${a}" (try --help)`, EXIT.USAGE);
  }
  return opts;
}

export const USAGE = `Usage: node scripts/observability/apply-grafana.mjs [--apply] [--sections <list>] [--only <uid>] [--exit-code]

  (no flags)        dry run: validate repo files and show the plan against live Grafana (writes nothing)
  --apply           create/update through the Grafana HTTP APIs (never deletes)
  --sections LIST   dashboards (default) | alerts | policies | synthetics | all   (comma separated)
                    alerts: rules are created PAUSED unless the repo file says isPaused:false (explicit resume); an update keeps the live pause state otherwise
                    policies: merges P1/P2 child routes into the shared policy tree + contact point pawpi-digest
                    synthetics: no-op unless GRAFANA_SM_URL and GRAFANA_SM_TOKEN are set
  --only UID        limit to uids (dashboard / alert rule uids, SM job names; comma separated or repeated)
  --dir PATH        dashboards directory (default observability/grafana/dashboards)
  --alerts-dir PATH / --synthetics-dir PATH   override observability/grafana/{alerts,synthetics}
  --exit-code       dry run exits 4 when changes are pending

Env: GRAFANA_URL, GRAFANA_SA_TOKEN (service account token: dashboards + folders + alert rules + notification policies +
     contact points write, datasources read), optional GRAFANA_PROM_DS / GRAFANA_LOKI_DS (datasource name or uid override),
     ALERT_DIGEST_EMAIL (P2 digest recipients), GRAFANA_SM_URL + GRAFANA_SM_TOKEN (Synthetic Monitoring).
`;

// ---------------------------------------------------------------- repo files
/** Stable key order + drop server-managed fields, so two JSONs compare equal iff they mean the same dashboard. */
export function normalizeDashboard(dashboard) {
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
    return v;
  };
  const copy = JSON.parse(JSON.stringify(dashboard));
  delete copy.id;
  delete copy.version;
  return sortDeep(copy);
}

export function assertPawpiUid(uid, what = 'object') {
  if (typeof uid !== 'string' || !uid.startsWith(UID_PREFIX)) {
    throw new ApplyError(`refusing to touch ${what} with uid "${uid}": only uids starting with "${UID_PREFIX}" are managed here`, EXIT.USAGE);
  }
}

/** Load + validate every *.json in `dir`. Throws ApplyError(USAGE) listing every problem. */
export function loadDashboards(dir = DEFAULT_DASHBOARD_DIR) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new ApplyError(`dashboards directory not found: ${dir}`, EXIT.USAGE);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new ApplyError(`no *.json dashboards in ${dir}`, EXIT.USAGE);
  const problems = [];
  const out = [];
  const seen = new Set();
  for (const file of files) {
    let dashboard;
    try {
      dashboard = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (e) {
      problems.push(`${file}: invalid JSON (${e.message})`);
      continue;
    }
    const expected = `${UID_PREFIX}${file.replace(/\.json$/, '')}`;
    if (typeof dashboard.uid !== 'string' || !dashboard.uid.startsWith(UID_PREFIX)) problems.push(`${file}: uid "${dashboard.uid}" must start with "${UID_PREFIX}"`);
    else if (dashboard.uid !== expected) problems.push(`${file}: uid "${dashboard.uid}" must equal "${expected}" (pawpi- + file name)`);
    if (seen.has(dashboard.uid)) problems.push(`${file}: duplicate uid ${dashboard.uid}`);
    seen.add(dashboard.uid);
    if (!dashboard.title) problems.push(`${file}: missing title`);
    if (!Array.isArray(dashboard.panels)) problems.push(`${file}: missing panels`);
    out.push({ file, uid: dashboard.uid, title: dashboard.title, dashboard });
  }
  if (problems.length) throw new ApplyError(`invalid dashboards:\n  - ${problems.join('\n  - ')}`, EXIT.USAGE);
  return out;
}

export function countPanels(dashboard) {
  let n = 0;
  const walk = (ps = []) => ps.forEach((p) => {
    if (p.type !== 'row') n += 1;
    walk(p.panels);
  });
  walk(dashboard.panels);
  return n;
}

// ---------------------------------------------------------------- HTTP (node:http/https; no dependencies, no fetch)
/**
 * Minimal JSON client. Writes (POST/PUT/PATCH) only to paths matching `allowWrite`; DELETE is ALWAYS refused.
 * Errors never include the token or the request body.
 */
export function createHttp({ baseUrl, token, allowWrite = DEFAULT_WRITE_ALLOW, timeoutMs = 20_000, urlEnv = 'GRAFANA_URL' }) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ApplyError(`${urlEnv} is not a valid URL`, EXIT.CONFIG);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ApplyError(`${urlEnv} must be http(s)`, EXIT.CONFIG);
  const basePath = url.pathname.replace(/\/+$/, '');
  const lib = url.protocol === 'https:' ? https : http;
  const origin = url.origin; // never includes credentials

  function request(method, apiPath, body, extraHeaders = {}) {
    if (method === 'DELETE') throw new ApplyError('DELETE is never allowed by this script', EXIT.USAGE);
    if (method !== 'GET' && !allowWrite.some((re) => re.test(apiPath))) {
      throw new ApplyError(`write to ${apiPath} is not on the allow-list`, EXIT.USAGE);
    }
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: basePath + apiPath,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...extraHeaders,
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {}
            resolve({ status: res.statusCode, json, text });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => reject(new ApplyError(`${method} ${apiPath}: ${e.code || e.message} (is ${urlEnv} reachable?)`, EXIT.GRAFANA)));
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    origin,
    get: (p) => request('GET', p),
    post: (p, body, headers) => request('POST', p, body, headers),
    put: (p, body, headers) => request('PUT', p, body, headers),
    request,
  };
}

/** Write endpoints this script may POST to. Step D: pass more via main({ extraWriteAllow }). */
export const DEFAULT_WRITE_ALLOW = [/^\/api\/dashboards\/db$/, /^\/api\/folders$/];

function expectOk(res, what, okStatuses = [200]) {
  if (okStatuses.includes(res.status)) return res;
  const hint =
    res.status === 401 ? ' (token rejected: check GRAFANA_SA_TOKEN)' :
    res.status === 403 ? ' (token lacks permission: needs dashboards/folders write and datasources read)' : '';
  const detail = res.json?.message ? `: ${String(res.json.message).slice(0, 200)}` : '';
  throw new ApplyError(`${what} failed with HTTP ${res.status}${hint}${detail}`, EXIT.GRAFANA);
}

// ---------------------------------------------------------------- folder
/** Find folder "PawPi" by title (exact). Returns {uid,title} or null. Never modifies an existing folder. */
export async function findFolder(http, title = FOLDER_TITLE) {
  const res = expectOk(await http.get(`/api/search?type=dash-folder&query=${encodeURIComponent(title)}`), 'folder search');
  const hit = (Array.isArray(res.json) ? res.json : []).find((f) => f.title === title && (f.type === undefined || f.type === 'dash-folder'));
  return hit ? { uid: hit.uid, title: hit.title } : null;
}

/** Ensure the folder exists. In dry-run mode (apply=false) nothing is created and `created` says what would happen. */
export async function ensureFolder(http, { apply = false, title = FOLDER_TITLE } = {}) {
  const found = await findFolder(http, title);
  if (found) return { ...found, created: false, wouldCreate: false };
  if (!apply) return { uid: FOLDER_UID, title, created: false, wouldCreate: true };
  assertPawpiUid(FOLDER_UID, 'folder');
  const res = expectOk(await http.post('/api/folders', { uid: FOLDER_UID, title }), 'folder create', [200, 201]);
  return { uid: res.json?.uid || FOLDER_UID, title, created: true, wouldCreate: false };
}

// ---------------------------------------------------------------- datasources
const PREFER = {
  prometheus: [/grafanacloud-.*-prom/i, /prom/i],
  loki: [/grafanacloud-.*-logs/i, /loki|logs/i],
};

/** Choose one datasource of `type` (override by name/uid first, then name preference, then isDefault, then first). */
export function pickDatasource(list, type, override) {
  const ofType = list.filter((d) => d.type === type);
  if (override) {
    const hit = ofType.find((d) => d.uid === override || d.name === override);
    if (!hit) throw new ApplyError(`datasource override "${override}" is not a ${type} datasource in this Grafana`, EXIT.GRAFANA);
    return hit;
  }
  if (!ofType.length) return null;
  for (const re of PREFER[type] ?? []) {
    const hit = ofType.find((d) => re.test(d.name || ''));
    if (hit) return hit;
  }
  return ofType.find((d) => d.isDefault) ?? ofType[0];
}

/** @returns {{prometheus: {uid,name}, loki: {uid,name}|null}} */
export async function resolveDatasources(http, env = {}) {
  const res = expectOk(await http.get('/api/datasources'), 'datasource list');
  const list = Array.isArray(res.json) ? res.json : [];
  const prometheus = pickDatasource(list, 'prometheus', env.GRAFANA_PROM_DS);
  const loki = pickDatasource(list, 'loki', env.GRAFANA_LOKI_DS);
  if (!prometheus) throw new ApplyError('no Prometheus datasource found in Grafana (needed for the dashboards)', EXIT.GRAFANA);
  if (!loki) throw new ApplyError('no Loki datasource found in Grafana (needed for the behaviour/log panels)', EXIT.GRAFANA);
  return {
    prometheus: { uid: prometheus.uid, name: prometheus.name },
    loki: { uid: loki.uid, name: loki.name },
  };
}

/** Replace the placeholders in-memory (deep, every string). Returns a NEW object; the repo JSON is never changed. */
export function substituteDatasources(dashboard, ds) {
  const map = { [PLACEHOLDERS.prometheus]: ds.prometheus.uid, [PLACEHOLDERS.loki]: ds.loki.uid };
  if (ds.usage) map[PLACEHOLDERS.usage] = ds.usage.uid;
  const sub = (v) => {
    if (typeof v === 'string') {
      let s = v;
      for (const [ph, uid] of Object.entries(map)) s = s.split(ph).join(uid);
      return s;
    }
    if (Array.isArray(v)) return v.map(sub);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]));
    return v;
  };
  return sub(dashboard);
}

// ---------------------------------------------------------------- dashboards section
/** Compare desired vs live. Returns {action: 'create'|'update'|'unchanged', reasons: string[]}. */
export async function planDashboard(http, entry, { desired, folderUid }) {
  assertPawpiUid(entry.uid, 'dashboard');
  const res = await http.get(`/api/dashboards/uid/${encodeURIComponent(entry.uid)}`);
  if (res.status === 404) return { action: 'create', reasons: ['not found in Grafana'] };
  expectOk(res, `dashboard ${entry.uid} fetch`);
  const reasons = [];
  const live = normalizeDashboard(res.json?.dashboard ?? {});
  if (JSON.stringify(live) !== JSON.stringify(normalizeDashboard(desired))) reasons.push('content differs');
  const liveFolder = res.json?.meta?.folderUid ?? '';
  if (folderUid && liveFolder !== folderUid) reasons.push('folder differs');
  return reasons.length ? { action: 'update', reasons } : { action: 'unchanged', reasons: [] };
}

export const dashboardsSection = {
  name: 'dashboards',
  /** @returns {Promise<{items: Array<{kind,uid,title,action,reasons,panels}>, notes: string[]}>} */
  async plan(ctx) {
    const entries = ctx.dashboards;
    const items = entries.map((e) => ({ kind: 'dashboard', uid: e.uid, title: e.title, panels: countPanels(e.dashboard), action: 'validated', reasons: [], entry: e }));
    const notes = [];
    if (!ctx.http) {
      notes.push('live diff skipped (set GRAFANA_URL and GRAFANA_SA_TOKEN to compare against Grafana)');
      return { items, notes };
    }
    for (const it of items) {
      const desired = substituteDatasources(it.entry.dashboard, ctx.datasources);
      const p = await planDashboard(ctx.http, it.entry, { desired, folderUid: ctx.folder.uid });
      it.action = p.action;
      it.reasons = p.reasons;
      it.desired = desired;
    }
    return { items, notes };
  },
  async apply(ctx, plan) {
    const results = [];
    for (const it of plan.items) {
      if (it.action === 'unchanged') continue;
      assertPawpiUid(it.uid, 'dashboard');
      const res = expectOk(
        await ctx.http.post('/api/dashboards/db', {
          dashboard: { ...it.desired, id: null },
          folderUid: ctx.folder.uid,
          overwrite: true,
          message: 'apply-grafana.mjs (observability-as-code)',
        }),
        `dashboard ${it.uid} write`,
      );
      results.push({ uid: it.uid, version: res.json?.version });
    }
    return results;
  },
};

// ================================================================ Step D: shared helpers
/** "Nothing" in every spelling a server may use when it omits a default (false, null, "", [], {}). */
function isEmptyish(v) {
  if (v === undefined || v === null || v === false || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

/**
 * True when everything `desired` says is also true of `live` (live may carry extra, server-added fields; an empty-ish desired
 * value matches a missing one). Arrays must match element by element.
 */
export function subsetEqual(desired, live) {
  if (isEmptyish(desired)) return isEmptyish(live);
  if (Array.isArray(desired)) return Array.isArray(live) && desired.length === live.length && desired.every((d, i) => subsetEqual(d, live[i]));
  if (typeof desired === 'object') {
    return Boolean(live) && typeof live === 'object' && !Array.isArray(live) && Object.keys(desired).every((k) => subsetEqual(desired[k], live[k]));
  }
  return desired === live;
}

/** Exact equality of two string maps (labels / annotations): no extra and no missing keys. */
export function sameMap(a = {}, b = {}) {
  const ka = Object.keys(a ?? {}).sort();
  const kb = Object.keys(b ?? {}).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const sortDeep = (v) => {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
};
const stable = (v) => JSON.stringify(sortDeep(v));

function readJsonDir(dir, what) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new ApplyError(`${what} directory not found: ${dir}`, EXIT.USAGE);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new ApplyError(`no *.json ${what} in ${dir}`, EXIT.USAGE);
  const problems = [];
  const docs = [];
  for (const file of files) {
    try {
      docs.push({ file, doc: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) });
    } catch (e) {
      problems.push(`${file}: invalid JSON (${e.message})`);
    }
  }
  return { docs, problems };
}

/** Write headers for provisioning APIs: keep the objects editable in the Grafana UI (no "provisioned, read-only" lock). */
export const PROVISION_HEADERS = Object.freeze({ 'X-Disable-Provenance': 'true' });
export const ALERT_WRITE_ALLOW = [/^\/api\/v1\/provisioning\/alert-rules(\/pawpi-[A-Za-z0-9_-]+)?$/];
export const DIGEST_CONTACT_UID = 'pawpi-digest';
export const POLICY_WRITE_ALLOW = [/^\/api\/v1\/provisioning\/policies$/, /^\/api\/v1\/provisioning\/contact-points(\/pawpi-digest)?$/];
export const SM_WRITE_ALLOW = [/^\/api\/v1\/check\/(add|update)$/];
export const P1_CONTACT_POINT = 'Augusto';

// ================================================================ alerts section
/** Load + validate alert rule files ({apiVersion:1, groups:[{name, folder, rules}]}). The deep lint runs in the test suite. */
export function loadAlerts(dir = DEFAULT_ALERTS_DIR) {
  const { docs, problems } = readJsonDir(dir, 'alert rules');
  const rules = [];
  const seen = new Set();
  for (const { file, doc } of docs) {
    if (doc?.apiVersion !== 1 || !Array.isArray(doc.groups)) {
      problems.push(`${file}: expected {"apiVersion":1,"groups":[...]}`);
      continue;
    }
    for (const g of doc.groups) {
      if (typeof g.name !== 'string' || !g.name.startsWith(UID_PREFIX)) problems.push(`${file}: group "${g.name}" must start with "${UID_PREFIX}"`);
      if (g.folder !== FOLDER_TITLE) problems.push(`${file}: group "${g.name}" must declare folder "${FOLDER_TITLE}"`);
      for (const r of g.rules ?? []) {
        const at = `${file}: rule ${r.uid}`;
        if (typeof r.uid !== 'string' || !r.uid.startsWith(UID_PREFIX)) problems.push(`${file}: rule uid "${r.uid}" must start with "${UID_PREFIX}"`);
        if (seen.has(r.uid)) problems.push(`${at}: duplicate uid`);
        seen.add(r.uid);
        if (!r.title) problems.push(`${at}: missing title`);
        if (typeof r.isPaused !== 'boolean') problems.push(`${at}: isPaused must be true (paused / keep live state) or false (explicit resume) in the repo file`);
        if (!Array.isArray(r.data) || !r.data.length || !r.condition) problems.push(`${at}: missing data/condition`);
        if (typeof r.for !== 'string') problems.push(`${at}: missing "for"`);
        if (!['P1', 'P2'].includes(r.labels?.severity)) problems.push(`${at}: labels.severity must be P1 or P2`);
        rules.push({ file, uid: r.uid, title: r.title, group: g.name, severity: r.labels?.severity, rule: r });
      }
    }
  }
  if (problems.length) throw new ApplyError(`invalid alert rules:\n  - ${problems.join('\n  - ')}`, EXIT.USAGE);
  return rules;
}

/** The Grafana Cloud usage datasource (type prometheus, name contains "usage"), or null. */
export function pickUsageDatasource(list) {
  return list.find((d) => d.type === 'prometheus' && /usage/i.test(d.name || '') && !/insights/i.test(d.name || '')) ?? null;
}

/** Provisioning-API body for one rule (placeholders resolved). Returns null when a needed datasource does not exist. */
export function buildAlertRule(entry, { folderUid, datasources, usage }) {
  const raw = clone(entry.rule);
  if (JSON.stringify(raw).includes(PLACEHOLDERS.usage) && !usage) return null;
  const withMeta = { ...raw, folderUID: folderUid, ruleGroup: entry.group };
  return substituteDatasources(withMeta, { ...datasources, usage });
}

/**
 * Why the live rule differs from the desired one ([] = identical). The live pause state is NOT compared, except for the one
 * explicit declaration: the repo says isPaused:false and the live rule is still paused (= a pending resume).
 */
export function diffAlertRule(desired, live) {
  const reasons = [];
  for (const k of ['title', 'condition', 'noDataState', 'execErrState', 'for', 'folderUID', 'ruleGroup']) {
    if (desired[k] !== live[k]) reasons.push(`${k} differs`);
  }
  if (!sameMap(desired.labels, live.labels)) reasons.push('labels differ');
  if (!sameMap(desired.annotations, live.annotations)) reasons.push('annotations differ');
  if (!subsetEqual(desired.data, live.data)) reasons.push('queries/threshold differ');
  if (desired.isPaused === false && live.isPaused) reasons.push('resumes the rule (repo declares isPaused:false)');
  return reasons;
}

export const alertsSection = {
  name: 'alerts',
  writeAllow: ALERT_WRITE_ALLOW,
  load(ctx) {
    ctx.alerts = loadAlerts(ctx.opts.alertsDir);
  },
  knownUids: (ctx) => (ctx.alerts ?? []).map((a) => a.uid),
  async plan(ctx) {
    const only = ctx.opts.only;
    const entries = ctx.alerts.filter((a) => !only.length || only.includes(a.uid));
    const items = entries.map((e) => ({
      kind: 'alert', uid: e.uid, title: e.title, detail: `${e.severity} for ${e.rule.for}, group ${e.group}`, action: 'validated', reasons: [], entry: e,
    }));
    const notes = [];
    if (!ctx.http) {
      notes.push('live diff skipped (set GRAFANA_URL and GRAFANA_SA_TOKEN). Rules are created PAUSED (unless the file declares isPaused:false) and an update keeps the live pause state');
      return { items, notes };
    }
    const dsRes = expectOk(await ctx.http.get('/api/datasources'), 'datasource list');
    const usage = pickUsageDatasource(Array.isArray(dsRes.json) ? dsRes.json : []);
    let unpaused = 0;
    for (const it of items) {
      assertPawpiUid(it.uid, 'alert rule');
      const desired = buildAlertRule(it.entry, { folderUid: ctx.folder.uid, datasources: ctx.datasources, usage: usage && { uid: usage.uid, name: usage.name } });
      if (!desired) {
        it.action = 'skipped';
        it.reasons = ['needs the Grafana Cloud usage datasource (prometheus, name contains "usage"), not found'];
        continue;
      }
      it.desired = desired;
      const res = await ctx.http.get(`/api/v1/provisioning/alert-rules/${encodeURIComponent(it.uid)}`);
      if (res.status === 404) {
        it.action = 'create';
        it.reasons = [`not found in Grafana (will be created ${it.entry.rule.isPaused === false ? 'ACTIVE: repo declares isPaused:false' : 'PAUSED'})`];
        continue;
      }
      expectOk(res, `alert rule ${it.uid} fetch`);
      it.live = res.json ?? {};
      if (!it.live.isPaused) unpaused += 1;
      it.reasons = diffAlertRule(desired, it.live);
      it.action = it.reasons.length ? 'update' : 'unchanged';
      if (it.action === 'update' && it.entry.rule.isPaused !== false) it.reasons.push(`keeps live pause state: ${it.live.isPaused ? 'paused' : 'ACTIVE'}`);
    }
    if (unpaused) notes.push(`${unpaused} managed rule(s) are currently un-paused (owner decision): they stay un-paused; apply only ever resumes a rule the repo declares isPaused:false, it never pauses one`);
    return { items, notes };
  },
  async apply(ctx, plan) {
    const results = [];
    for (const it of plan.items) {
      if (it.action !== 'create' && it.action !== 'update') continue;
      assertPawpiUid(it.uid, 'alert rule');
      if (it.action === 'create') {
        // New rules are created paused unless the file explicitly declares isPaused:false.
        expectOk(await ctx.http.post('/api/v1/provisioning/alert-rules', { ...it.desired, isPaused: it.entry.rule.isPaused !== false }, PROVISION_HEADERS), `alert rule ${it.uid} create`, [200, 201]);
      } else {
        // Existing rule: resume only on an explicit isPaused:false; otherwise keep the live state (never re-pause).
        const body = { ...it.desired, isPaused: it.entry.rule.isPaused === false ? false : Boolean(it.live.isPaused) };
        if (it.live.orgID !== undefined) body.orgID = it.live.orgID;
        expectOk(await ctx.http.put(`/api/v1/provisioning/alert-rules/${encodeURIComponent(it.uid)}`, body, PROVISION_HEADERS), `alert rule ${it.uid} update`, [200]);
      }
      results.push({ uid: it.uid });
    }
    return results;
  },
};

// ================================================================ notification routing section
/**
 * Our two child routes. They are placed IN FRONT of the existing children: an older generic "PawPi folder -> Augusto" route
 * would otherwise swallow the P2 digest alerts first. They only match rules labelled pawpi_managed="true", so routing of every
 * other alert (the three legacy rules included) is unchanged.
 *  - P1: contact point Augusto (email + webhook to the autofix relay; push = IRM integration added to it by hand), grouped by
 *    area + alertname so each rule reaches the relay as its own dispatch.
 *  - P2: digest, grouped by area, group_interval 24h, to contact point pawpi-digest.
 */
export const POLICY_ROUTES = Object.freeze({
  p1: Object.freeze({
    receiver: P1_CONTACT_POINT,
    group_by: ['area', 'alertname'],
    object_matchers: [['pawpi_managed', '=', 'true'], ['severity', '=', 'P1']],
    group_wait: '30s',
    group_interval: '5m',
    repeat_interval: '4h',
    continue: false,
  }),
  p2: Object.freeze({
    receiver: DIGEST_CONTACT_UID,
    group_by: ['area'],
    object_matchers: [['pawpi_managed', '=', 'true'], ['severity', '=', 'P2']],
    group_wait: '10m',
    group_interval: '24h',
    repeat_interval: '24h',
    continue: false,
  }),
});
const POLICY_MANAGED_FIELDS = ['receiver', 'group_by', 'object_matchers', 'group_wait', 'group_interval', 'repeat_interval', 'continue'];

/** Canonical identity of a route's matchers (handles `object_matchers` triples and legacy `matchers` strings). */
export function routeIdentity(route) {
  const parts = [];
  for (const m of route?.object_matchers ?? []) if (Array.isArray(m) && m.length === 3) parts.push(`${m[0]}${m[1]}${m[2]}`);
  for (const m of route?.matchers ?? []) {
    const x = String(m).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(=~|!=|!~|=)\s*"?(.*?)"?\s*$/);
    if (x) parts.push(`${x[1]}${x[2]}${x[3]}`);
  }
  return parts.sort().join('&');
}

function managedEqual(route, want) {
  const pick = (r) => Object.fromEntries(POLICY_MANAGED_FIELDS.map((k) => [k, k === 'continue' ? Boolean(r[k]) : r[k]]));
  return stable(pick(route)) === stable(pick(want)) && !route.matchers && !route.match && !route.match_re;
}

/**
 * Merge our routes into a policy tree. PURE: returns a new tree; never removes or alters a route that is not ours.
 * @param {object} tree  the root route as returned by GET /api/v1/provisioning/policies
 * @param {{includeP2: boolean}} opts
 * @returns {{tree: object, changes: Array<{key: 'p1'|'p2', action: 'create'|'update'|'unchanged'}>}}
 */
export function mergePolicyTree(tree, { includeP2 = true } = {}) {
  const next = clone(tree);
  delete next.provenance; // read-only on GET; not part of the PUT body
  const children = Array.isArray(next.routes) ? next.routes : [];
  const keys = includeP2 ? ['p1', 'p2'] : ['p1'];
  const ownIds = new Set(Object.values(POLICY_ROUTES).map(routeIdentity));
  const created = [];
  const changes = [];
  for (const key of keys) {
    const want = clone(POLICY_ROUTES[key]);
    const idx = children.findIndex((c) => routeIdentity(c) === routeIdentity(want));
    if (idx < 0) {
      created.push(want);
      changes.push({ key, action: 'create' });
    } else if (managedEqual(children[idx], want)) {
      changes.push({ key, action: 'unchanged' });
    } else {
      const merged = { ...children[idx], ...want }; // keeps owner-added nested routes / mute timings of OUR route
      delete merged.matchers;
      delete merged.match;
      delete merged.match_re;
      children[idx] = merged;
      changes.push({ key, action: 'update' });
    }
  }
  next.routes = [...created, ...children];
  assertPolicyPreserved(tree, next, ownIds);
  return { tree: next, changes };
}

/** Defensive invariant: every route that is not ours is still there, identical, in the same order; root fields untouched. */
export function assertPolicyPreserved(before, after, ownIds) {
  const others = (t) => (Array.isArray(t.routes) ? t.routes : []).filter((r) => !ownIds.has(routeIdentity(r)));
  const rootOf = (t) => {
    const { routes, provenance, ...rest } = t; // eslint-disable-line no-unused-vars
    return rest;
  };
  if (stable(others(before)) !== stable(others(after)) || JSON.stringify(others(before).map(routeIdentity)) !== JSON.stringify(others(after).map(routeIdentity))) {
    throw new ApplyError('internal safety check failed: the merge would change an existing notification route; nothing was written', EXIT.GRAFANA);
  }
  if (stable(rootOf(before)) !== stable(rootOf(after))) {
    throw new ApplyError('internal safety check failed: the merge would change the root notification policy; nothing was written', EXIT.GRAFANA);
  }
}

/** Parse ALERT_DIGEST_EMAIL ("a@x.com; b@y.com") into valid, de-duplicated addresses. */
export function parseDigestEmails(value) {
  const out = [];
  for (const p of String(value ?? '').split(/[;,\s]+/)) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p) && !out.includes(p)) out.push(p);
  }
  return out;
}
const addrSet = (s) => String(s ?? '').split(/[;,\n\s]+/).filter(Boolean).sort().join(';');

export const policiesSection = {
  name: 'policies',
  writeAllow: POLICY_WRITE_ALLOW,
  needsFolder: false,
  needsDatasources: false,
  knownUids: () => ['pawpi-policy-p1', 'pawpi-policy-p2', DIGEST_CONTACT_UID],
  async plan(ctx) {
    const only = ctx.opts.only;
    const want = (uid) => !only.length || only.includes(uid);
    const items = [];
    const notes = [];
    const base = (uid, title, detail) => ({ kind: 'routing', uid, title, detail, action: 'validated', reasons: [] });
    const digestItem = want(DIGEST_CONTACT_UID) ? base(DIGEST_CONTACT_UID, 'contact point (email digest for P2)', 'email, singleEmail') : null;
    const p1Item = want('pawpi-policy-p1') ? base('pawpi-policy-p1', 'policy route: P1 -> Augusto', 'group by area+alertname, repeat 4h') : null;
    const p2Item = want('pawpi-policy-p2') ? base('pawpi-policy-p2', 'policy route: P2 -> pawpi-digest', 'group by area, group_interval 24h') : null;
    for (const it of [digestItem, p1Item, p2Item]) if (it) items.push(it);
    if (!ctx.http) {
      notes.push('live diff skipped (set GRAFANA_URL and GRAFANA_SA_TOKEN). Routes are MERGED into the shared tree; existing routes and contact point Augusto are never altered');
      return { items, notes };
    }

    const cps = expectOk(await ctx.http.get('/api/v1/provisioning/contact-points'), 'contact point list');
    const contacts = Array.isArray(cps.json) ? cps.json : [];
    if (!contacts.some((c) => c.name === P1_CONTACT_POINT)) {
      throw new ApplyError(`contact point "${P1_CONTACT_POINT}" not found: it must exist (email + autofix webhook) before P1 routing can be applied; nothing was changed`, EXIT.GRAFANA);
    }
    const addrs = parseDigestEmails(ctx.env.ALERT_DIGEST_EMAIL);
    const liveDigest = contacts.find((c) => c.uid === DIGEST_CONTACT_UID || c.name === DIGEST_CONTACT_UID);
    ctx.policyState = { addrs, liveDigest };
    let digestUsable = false;
    if (digestItem) {
      if (liveDigest && liveDigest.type !== 'email') {
        digestItem.action = 'skipped';
        digestItem.reasons = [`a contact point named ${DIGEST_CONTACT_UID} already exists with type "${liveDigest.type}"; left alone`];
      } else if (!addrs.length) {
        digestItem.action = liveDigest ? 'unchanged' : 'skipped';
        digestItem.reasons = liveDigest ? ['ALERT_DIGEST_EMAIL not set: existing digest contact point left as is'] : ['ALERT_DIGEST_EMAIL is not set (or has no valid address): digest contact point and P2 route are skipped'];
        digestUsable = Boolean(liveDigest);
      } else if (!liveDigest) {
        digestItem.action = 'create';
        digestItem.reasons = [`not found in Grafana (${addrs.length} address(es) from ALERT_DIGEST_EMAIL)`];
        digestUsable = true;
      } else {
        const same = addrSet(liveDigest.settings?.addresses) === addrSet(addrs.join(';'));
        digestItem.action = same ? 'unchanged' : 'update';
        digestItem.reasons = same ? [] : ['addresses differ'];
        digestUsable = true;
      }
      digestItem.detail = `email, ${addrs.length || (liveDigest ? 'existing' : 0)} address(es), never printed`;
    } else {
      digestUsable = Boolean(liveDigest) || addrs.length > 0;
    }
    ctx.policyState.digestUsable = digestUsable;

    const tree = expectOk(await ctx.http.get('/api/v1/provisioning/policies'), 'notification policy fetch').json ?? {};
    const { changes } = mergePolicyTree(tree, { includeP2: digestUsable });
    for (const [key, it] of [['p1', p1Item], ['p2', p2Item]]) {
      if (!it) continue;
      const c = changes.find((x) => x.key === key);
      if (!c) {
        it.action = 'skipped';
        it.reasons = ['P2 digest contact point is not available (set ALERT_DIGEST_EMAIL); do NOT un-pause P2 rules until it is, or they would match an older generic route'];
      } else {
        it.action = c.action;
        it.reasons = c.action === 'create' ? ['route not in the tree (will be added in front of the existing routes)'] : c.action === 'update' ? ['route differs'] : [];
      }
    }
    notes.push(`existing root + ${Array.isArray(tree.routes) ? tree.routes.length : 0} child route(s) are preserved untouched; contact point ${P1_CONTACT_POINT} is never written`);
    return { items, notes };
  },
  async apply(ctx, plan) {
    const results = [];
    const state = ctx.policyState ?? {};
    const byUid = Object.fromEntries(plan.items.map((i) => [i.uid, i]));
    const digest = byUid[DIGEST_CONTACT_UID];
    if (digest && (digest.action === 'create' || digest.action === 'update')) {
      const body = {
        uid: DIGEST_CONTACT_UID, name: DIGEST_CONTACT_UID, type: 'email', disableResolveMessage: true,
        settings: { addresses: state.addrs.join(';'), singleEmail: false },
      };
      if (digest.action === 'create') expectOk(await ctx.http.post('/api/v1/provisioning/contact-points', body, PROVISION_HEADERS), 'contact point create', [200, 201, 202]);
      else expectOk(await ctx.http.put(`/api/v1/provisioning/contact-points/${DIGEST_CONTACT_UID}`, body, PROVISION_HEADERS), 'contact point update', [200, 202]);
      results.push({ uid: DIGEST_CONTACT_UID });
    }
    const touched = ['pawpi-policy-p1', 'pawpi-policy-p2'].filter((u) => byUid[u] && (byUid[u].action === 'create' || byUid[u].action === 'update'));
    if (touched.length) {
      // Re-read right before writing so a concurrent UI edit of OTHER routes is not overwritten with a stale copy.
      const fresh = expectOk(await ctx.http.get('/api/v1/provisioning/policies'), 'notification policy fetch').json ?? {};
      const { tree, changes } = mergePolicyTree(fresh, { includeP2: Boolean(state.digestUsable) });
      if (changes.some((c) => c.action !== 'unchanged')) {
        expectOk(await ctx.http.put('/api/v1/provisioning/policies', tree, PROVISION_HEADERS), 'notification policy update', [200, 201, 202]);
        for (const u of touched) results.push({ uid: u });
      }
    }
    return results;
  },
};

// ================================================================ synthetics section (Grafana Synthetic Monitoring)
/** Load + validate synthetic check definitions. `probeRegions` is a repo-only field (resolved to probe ids at apply time). */
export function loadChecks(dir = DEFAULT_SYNTHETICS_DIR) {
  const { docs, problems } = readJsonDir(dir, 'synthetic checks');
  const out = [];
  const seen = new Set();
  for (const { file, doc } of docs) {
    const expected = `${UID_PREFIX}${file.replace(/\.json$/, '')}`;
    if (doc.job !== expected) problems.push(`${file}: job "${doc.job}" must equal "${expected}" (pawpi- + file name)`);
    if (seen.has(doc.job)) problems.push(`${file}: duplicate job ${doc.job}`);
    seen.add(doc.job);
    if (typeof doc.target !== 'string' || !/^https:\/\//.test(doc.target)) problems.push(`${file}: target must be an https URL`);
    if (!Number.isInteger(doc.frequency) || doc.frequency < 60_000) problems.push(`${file}: frequency must be >= 60000 ms`);
    if (!doc.settings?.http) problems.push(`${file}: missing settings.http`);
    if (!Array.isArray(doc.probeRegions) || !doc.probeRegions.length) problems.push(`${file}: probeRegions (e.g. ["EMEA","AMER"]) is required`);
    out.push({ file, job: doc.job, check: doc });
  }
  if (problems.length) throw new ApplyError(`invalid synthetic checks:\n  - ${problems.join('\n  - ')}`, EXIT.USAGE);
  return out;
}

/** One online public probe per region (the alphabetically first, so the choice is stable). Throws if a region has none. */
export function pickProbes(probes, regions) {
  const ids = [];
  for (const region of regions) {
    const hit = probes
      .filter((p) => p.public !== false && p.online !== false && String(p.region).toUpperCase() === String(region).toUpperCase())
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))[0];
    if (!hit) {
      const have = [...new Set(probes.map((p) => p.region))].join(', ');
      throw new ApplyError(`no online public Synthetic Monitoring probe in region "${region}" (regions available: ${have})`, EXIT.GRAFANA);
    }
    ids.push(hit.id);
  }
  return ids;
}

const sortLabels = (labels) => [...(labels ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));

export function diffCheck(desired, live) {
  const reasons = [];
  for (const k of ['target', 'frequency', 'timeout', 'enabled', 'alertSensitivity', 'basicMetricsOnly']) {
    if (!subsetEqual(desired[k], live[k]) || (isEmptyish(desired[k]) !== isEmptyish(live[k]))) reasons.push(`${k} differs`);
  }
  if (!subsetEqual(sortLabels(desired.labels), sortLabels(live.labels))) reasons.push('labels differ');
  if (!subsetEqual(desired.settings, live.settings)) reasons.push('settings differ');
  return reasons;
}

export const syntheticsSection = {
  name: 'synthetics',
  writeAllow: [], // SM has its own http client (SM_WRITE_ALLOW)
  needsGrafana: false,
  needsFolder: false,
  needsDatasources: false,
  load(ctx) {
    ctx.checks = loadChecks(ctx.opts.syntheticsDir);
  },
  knownUids: (ctx) => (ctx.checks ?? []).map((c) => c.job),
  async plan(ctx) {
    const only = ctx.opts.only;
    const entries = ctx.checks.filter((c) => !only.length || only.includes(c.job));
    const items = entries.map((e) => ({
      kind: 'check', uid: e.job, title: e.check.target, detail: `every ${e.check.frequency / 60000} min from ${e.check.probeRegions.join('+')}`,
      action: 'validated', reasons: [], entry: e,
    }));
    const notes = [];
    if (!ctx.sm) {
      notes.push('NO-OP: set GRAFANA_SM_URL and GRAFANA_SM_TOKEN (Synthetic Monitoring API URL + access token) to plan/apply these checks');
      return { items, notes };
    }
    const list = expectOk(await ctx.sm.get('/api/v1/check/list'), 'synthetic check list').json;
    const live = new Map((Array.isArray(list) ? list : []).filter((c) => String(c.job).startsWith(UID_PREFIX)).map((c) => [c.job, c]));
    let probes = null;
    for (const it of items) {
      assertPawpiUid(it.uid, 'synthetic check');
      const { probeRegions, ...desired } = clone(it.entry.check); // eslint-disable-line no-unused-vars
      const have = live.get(it.uid);
      if (!have) {
        probes ??= expectOk(await ctx.sm.get('/api/v1/probe/list'), 'synthetic probe list').json ?? [];
        it.desired = { ...desired, probes: pickProbes(probes, it.entry.check.probeRegions) };
        it.action = 'create';
        it.reasons = ['not found in Synthetic Monitoring'];
      } else {
        // Probes are chosen when the check is created; later runs keep the live probe set.
        it.desired = { ...desired, probes: have.probes };
        it.live = have;
        it.reasons = diffCheck(desired, have);
        it.action = it.reasons.length ? 'update' : 'unchanged';
      }
    }
    return { items, notes };
  },
  async apply(ctx, plan) {
    const results = [];
    if (!ctx.sm) return results;
    for (const it of plan.items) {
      if (it.action !== 'create' && it.action !== 'update') continue;
      assertPawpiUid(it.uid, 'synthetic check');
      if (it.action === 'create') expectOk(await ctx.sm.post('/api/v1/check/add', it.desired), `synthetic check ${it.uid} create`, [200, 201]);
      else expectOk(await ctx.sm.post('/api/v1/check/update', { ...it.desired, id: it.live.id, tenantId: it.live.tenantId }), `synthetic check ${it.uid} update`, [200]);
      results.push({ uid: it.uid });
    }
    return results;
  },
};

/** Sections run in order. The default stays dashboards-only (Step C behaviour); `--sections` picks others. */
export const defaultSections = [dashboardsSection];
export const allSections = Object.freeze({
  dashboards: dashboardsSection,
  alerts: alertsSection,
  policies: policiesSection,
  synthetics: syntheticsSection,
});

// ---------------------------------------------------------------- main
function line(it) {
  const tag = it.action.padEnd(9);
  const extra = it.reasons?.length ? `  (${it.reasons.join(', ')})` : '';
  const detail = it.detail ?? (it.panels !== undefined ? `${it.panels} panels` : '');
  return `  ${tag} ${it.uid}  "${it.title}"  ${detail}${extra}`;
}

/**
 * @param {object} [o]
 * @param {string[]} [o.argv]  default process.argv.slice(2)
 * @param {object}   [o.env]   default process.env
 * @param {(s:string)=>void} [o.out]
 * @param {(s:string)=>void} [o.err]
 * @param {Array}    [o.sections]       explicit section objects; default = the ones named by --sections (dashboards)
 * @param {RegExp[]} [o.extraWriteAllow] extra POST/PUT paths a custom section needs
 * @returns {Promise<number>} exit code
 */
export async function main({ argv = process.argv.slice(2), env = process.env, out = (s) => console.log(s), err = (s) => console.error(s), sections, extraWriteAllow = [] } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      out(USAGE);
      return EXIT.OK;
    }
    const selected = sections ?? opts.sections.map((n) => allSections[n]);
    let dashboards = loadDashboards(opts.dir);
    const ctx = { opts, dashboards, alerts: [], checks: [], http: null, sm: null, folder: null, datasources: null, env };
    for (const s of selected) if (s.load) s.load(ctx);
    if (opts.only.length) {
      for (const u of opts.only) assertPawpiUid(u, '--only target');
      const known = new Set([...dashboards.map((d) => d.uid), ...selected.flatMap((s) => (s.knownUids ? s.knownUids(ctx) : []))]);
      const unknown = opts.only.filter((u) => !known.has(u));
      if (unknown.length) throw new ApplyError(`--only: no such object in the selected sections (dashboards in ${opts.dir}, alerts, routing, checks): ${unknown.join(', ')}`, EXIT.USAGE);
      dashboards = dashboards.filter((d) => opts.only.includes(d.uid));
      ctx.dashboards = dashboards;
    }

    const url = (env.GRAFANA_URL || '').trim();
    const token = (env.GRAFANA_SA_TOKEN || '').trim();
    const haveEnv = Boolean(url && token);
    const needsGrafana = selected.some((s) => s.needsGrafana !== false);
    const needsFolder = selected.some((s) => s.needsFolder !== false);
    const needsDatasources = selected.some((s) => s.needsDatasources !== false);
    if (opts.apply && needsGrafana && !haveEnv) {
      const missing = [!url && 'GRAFANA_URL', !token && 'GRAFANA_SA_TOKEN'].filter(Boolean).join(' and ');
      throw new ApplyError(`--apply needs ${missing} in the environment`, EXIT.CONFIG);
    }

    out(`PawPi Grafana ${opts.apply ? 'APPLY' : 'DRY RUN'} - ${dashboards.length} dashboard(s) validated from ${path.relative(process.cwd(), opts.dir) || '.'}`);
    if (selected.some((s) => s.name !== 'dashboards')) out(`Sections: ${selected.map((s) => s.name).join(', ')}`);

    const writeAllow = [...DEFAULT_WRITE_ALLOW, ...selected.flatMap((s) => s.writeAllow ?? []), ...extraWriteAllow];
    if (needsGrafana && haveEnv) {
      ctx.http = createHttp({ baseUrl: url, token, allowWrite: writeAllow });
      out(`Grafana: ${ctx.http.origin}`);
      if (needsFolder) {
        ctx.folder = await ensureFolder(ctx.http, { apply: false });
        out(`Folder "${FOLDER_TITLE}": ${ctx.folder.wouldCreate ? `missing -> will be created (uid ${FOLDER_UID})` : `exists (uid ${ctx.folder.uid})`}`);
      }
      if (needsDatasources) {
        ctx.datasources = await resolveDatasources(ctx.http, env);
        out(`Datasources: Prometheus "${ctx.datasources.prometheus.name}", Loki "${ctx.datasources.loki.name}"`);
      }
    } else if (needsGrafana) {
      out('Grafana: no GRAFANA_URL / GRAFANA_SA_TOKEN -> live diff skipped (repo files validated only)');
    }
    if (selected.some((s) => s.name === 'synthetics')) {
      const smUrl = (env.GRAFANA_SM_URL || '').trim();
      const smToken = (env.GRAFANA_SM_TOKEN || '').trim();
      if (smUrl && smToken) {
        ctx.sm = createHttp({ baseUrl: smUrl, token: smToken, allowWrite: SM_WRITE_ALLOW, urlEnv: 'GRAFANA_SM_URL' });
        out(`Synthetic Monitoring: ${ctx.sm.origin}`);
      } else {
        out('Synthetic Monitoring: GRAFANA_SM_URL / GRAFANA_SM_TOKEN not both set -> synthetics section is a no-op');
      }
    }

    let pending = 0;
    const plans = [];
    for (const s of selected) {
      const plan = await s.plan(ctx);
      plans.push({ section: s, plan });
      out(`\n[${s.name}]`);
      for (const it of plan.items) out(line(it));
      for (const n of plan.notes ?? []) out(`  note: ${n}`);
      pending += plan.items.filter((i) => i.action === 'create' || i.action === 'update').length;
    }
    const counts = (a) => plans.flatMap((p) => p.plan.items).filter((i) => i.action === a).length;
    const compared = ctx.http || ctx.sm;
    const skipped = counts('skipped');
    out(`\nPlan: ${counts('create')} create, ${counts('update')} update, ${counts('unchanged')} unchanged${compared ? '' : ' (not compared)'}${ctx.folder?.wouldCreate ? ', folder will be created' : ''}${skipped ? `, ${skipped} skipped` : ''}`);

    if (!opts.apply) {
      out(compared ? 'Dry run only: nothing was written. Re-run with --apply to write.' : 'Dry run only. Set GRAFANA_URL and GRAFANA_SA_TOKEN to see the live diff.');
      return opts.exitCode && pending > 0 ? EXIT.PENDING : EXIT.OK;
    }

    if (needsFolder && ctx.http) {
      ctx.folder = await ensureFolder(ctx.http, { apply: true });
      if (ctx.folder.created) out(`Folder "${FOLDER_TITLE}" created (uid ${ctx.folder.uid})`);
    }
    for (const { section, plan } of plans) {
      const results = await section.apply(ctx, plan);
      for (const r of results) out(`  wrote ${r.uid}${r.version ? ` (version ${r.version})` : ''}`);
      if (!results.length) out(`  [${section.name}] nothing to write`);
    }
    out('Apply finished. Run again without --apply to confirm everything reads "unchanged".');
    return EXIT.OK;
  } catch (e) {
    if (e instanceof ApplyError) {
      err(`error: ${e.message}`);
      return e.code;
    }
    err(`unexpected error: ${e?.code || e?.name || 'Error'}`); // never echo arbitrary messages (could embed headers)
    return EXIT.GRAFANA;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => process.exit(code));
}
