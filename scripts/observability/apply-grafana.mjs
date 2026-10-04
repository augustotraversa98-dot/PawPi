#!/usr/bin/env node
// Apply PawPi's Grafana objects from this repo (observability-as-code).  Node >= 18, ZERO dependencies.
//
//   GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=glsa_... node scripts/observability/apply-grafana.mjs
//       DRY RUN (default): prints a per-object plan (create / update / unchanged) against what is live. Writes NOTHING.
//   ... node scripts/observability/apply-grafana.mjs --apply
//       Writes through the Grafana HTTP API. Idempotent: a second run reports everything `unchanged`.
//
// Flags: --apply, --only <uid>[,<uid>] (repeatable), --dir <dashboards dir>, --exit-code (dry run exits 4 when changes are
//        pending), --help.  Env: GRAFANA_URL, GRAFANA_SA_TOKEN (Bearer service-account token),
//        optional GRAFANA_PROM_DS / GRAFANA_LOKI_DS (datasource name or uid to force, otherwise resolved by type+name).
//
// SAFETY (enforced in code, covered by tests):
//   * only objects whose uid starts with `pawpi-` are ever written; anything else is refused;
//   * NOTHING is ever deleted (the HTTP helper refuses DELETE outright);
//   * the existing folder "PawPi" is reused (found by title); only a missing one is created (uid `pawpi-folder`);
//   * the token is never printed (errors carry method + path + status only);
//   * datasources are resolved at runtime by type/name; dashboards only carry the placeholders ${DS_PROMETHEUS} / ${DS_LOKI}.
//
// Exit codes: 0 ok | 1 usage / invalid repo files | 2 config missing (--apply without env) |
//             3 Grafana unreachable / rejected the request / datasource not found | 4 dry run with pending changes (--exit-code)
//
// EXTENDING (Step D alerts): the script is a list of SECTIONS ({ name, plan(ctx), apply(ctx, plan) }). `dashboardsSection`
// is the first; add alert rules with `main({ sections: [...defaultSections, alertsSection] })` or by pushing onto
// `defaultSections`, and list the extra write endpoints in `extraWriteAllow` so the HTTP guard lets them through.
// The helpers (createHttp, ensureFolder, resolveDatasources, ...) are named exports.

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UID_PREFIX = 'pawpi-';
export const FOLDER_TITLE = 'PawPi';
export const FOLDER_UID = 'pawpi-folder';
export const PLACEHOLDERS = Object.freeze({ prometheus: '${DS_PROMETHEUS}', loki: '${DS_LOKI}' });
export const EXIT = Object.freeze({ OK: 0, USAGE: 1, CONFIG: 2, GRAFANA: 3, PENDING: 4 });

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DASHBOARD_DIR = path.resolve(HERE, '../../observability/grafana/dashboards');

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
  const opts = { apply: false, only: [], dir: DEFAULT_DASHBOARD_DIR, exitCode: false, help: false };
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
    } else throw new ApplyError(`unknown argument "${a}" (try --help)`, EXIT.USAGE);
  }
  return opts;
}

export const USAGE = `Usage: node scripts/observability/apply-grafana.mjs [--apply] [--only <uid>] [--dir <path>] [--exit-code]

  (no flags)   dry run: validate dashboards and show the plan against live Grafana (writes nothing)
  --apply      create/update folder "PawPi" and dashboards pawpi-* through the Grafana HTTP API (never deletes)
  --only UID   limit to one or more dashboard uids (comma separated or repeated)
  --dir PATH   dashboards directory (default observability/grafana/dashboards)
  --exit-code  dry run exits 4 when changes are pending

Env: GRAFANA_URL, GRAFANA_SA_TOKEN (service account token with dashboards + folders write), optional
     GRAFANA_PROM_DS / GRAFANA_LOKI_DS (datasource name or uid override).
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
export function createHttp({ baseUrl, token, allowWrite = DEFAULT_WRITE_ALLOW, timeoutMs = 20_000 }) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ApplyError('GRAFANA_URL is not a valid URL', EXIT.CONFIG);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ApplyError('GRAFANA_URL must be http(s)', EXIT.CONFIG);
  const basePath = url.pathname.replace(/\/+$/, '');
  const lib = url.protocol === 'https:' ? https : http;
  const origin = url.origin; // never includes credentials

  function request(method, apiPath, body) {
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
      req.on('error', (e) => reject(new ApplyError(`${method} ${apiPath}: ${e.code || e.message} (is GRAFANA_URL reachable?)`, EXIT.GRAFANA)));
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    origin,
    get: (p) => request('GET', p),
    post: (p, body) => request('POST', p, body),
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

/** Sections run in order. Step D appends an alerts section here (or passes its own list to main). */
export const defaultSections = [dashboardsSection];

// ---------------------------------------------------------------- main
function line(it) {
  const tag = it.action.padEnd(9);
  const extra = it.reasons?.length ? `  (${it.reasons.join(', ')})` : '';
  return `  ${tag} ${it.uid}  "${it.title}"  ${it.panels ?? ''} panels${extra}`;
}

/**
 * @param {object} [o]
 * @param {string[]} [o.argv]  default process.argv.slice(2)
 * @param {object}   [o.env]   default process.env
 * @param {(s:string)=>void} [o.out]
 * @param {(s:string)=>void} [o.err]
 * @param {Array}    [o.sections]       default defaultSections
 * @param {RegExp[]} [o.extraWriteAllow] extra POST paths a later section needs (Step D)
 * @returns {Promise<number>} exit code
 */
export async function main({ argv = process.argv.slice(2), env = process.env, out = (s) => console.log(s), err = (s) => console.error(s), sections = defaultSections, extraWriteAllow = [] } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      out(USAGE);
      return EXIT.OK;
    }
    let dashboards = loadDashboards(opts.dir);
    if (opts.only.length) {
      for (const u of opts.only) assertPawpiUid(u, '--only target');
      const unknown = opts.only.filter((u) => !dashboards.some((d) => d.uid === u));
      if (unknown.length) throw new ApplyError(`--only: no such dashboard in ${opts.dir}: ${unknown.join(', ')}`, EXIT.USAGE);
      dashboards = dashboards.filter((d) => opts.only.includes(d.uid));
    }

    const url = (env.GRAFANA_URL || '').trim();
    const token = (env.GRAFANA_SA_TOKEN || '').trim();
    const haveEnv = Boolean(url && token);
    if (opts.apply && !haveEnv) {
      const missing = [!url && 'GRAFANA_URL', !token && 'GRAFANA_SA_TOKEN'].filter(Boolean).join(' and ');
      throw new ApplyError(`--apply needs ${missing} in the environment`, EXIT.CONFIG);
    }

    out(`PawPi Grafana ${opts.apply ? 'APPLY' : 'DRY RUN'} - ${dashboards.length} dashboard(s) validated from ${path.relative(process.cwd(), opts.dir) || '.'}`);

    const ctx = { opts, dashboards, http: null, folder: null, datasources: null, env };
    if (haveEnv) {
      ctx.http = createHttp({ baseUrl: url, token, allowWrite: [...DEFAULT_WRITE_ALLOW, ...extraWriteAllow] });
      out(`Grafana: ${ctx.http.origin}`);
      ctx.folder = await ensureFolder(ctx.http, { apply: false });
      ctx.datasources = await resolveDatasources(ctx.http, env);
      out(`Folder "${FOLDER_TITLE}": ${ctx.folder.wouldCreate ? `missing -> will be created (uid ${FOLDER_UID})` : `exists (uid ${ctx.folder.uid})`}`);
      out(`Datasources: Prometheus "${ctx.datasources.prometheus.name}", Loki "${ctx.datasources.loki.name}"`);
    } else {
      out('Grafana: no GRAFANA_URL / GRAFANA_SA_TOKEN -> live diff skipped (repo files validated only)');
    }

    let pending = 0;
    const plans = [];
    for (const s of sections) {
      const plan = await s.plan(ctx);
      plans.push({ section: s, plan });
      out(`\n[${s.name}]`);
      for (const it of plan.items) out(line(it));
      for (const n of plan.notes ?? []) out(`  note: ${n}`);
      pending += plan.items.filter((i) => i.action === 'create' || i.action === 'update').length;
    }
    const counts = (a) => plans.flatMap((p) => p.plan.items).filter((i) => i.action === a).length;
    out(`\nPlan: ${counts('create')} create, ${counts('update')} update, ${counts('unchanged')} unchanged${ctx.http ? '' : ' (not compared)'}${ctx.folder?.wouldCreate ? ', folder will be created' : ''}`);

    if (!opts.apply) {
      out(haveEnv ? 'Dry run only: nothing was written. Re-run with --apply to write.' : 'Dry run only. Set GRAFANA_URL and GRAFANA_SA_TOKEN to see the live diff.');
      return opts.exitCode && pending > 0 ? EXIT.PENDING : EXIT.OK;
    }

    ctx.folder = await ensureFolder(ctx.http, { apply: true });
    if (ctx.folder.created) out(`Folder "${FOLDER_TITLE}" created (uid ${ctx.folder.uid})`);
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
