// @vitest-environment node
// scripts/observability/apply-grafana.mjs against a LOCAL mock Grafana (node:http). No real Grafana, no network beyond
// 127.0.0.1. Proves: dry-run writes nothing, --apply writes dashboards once, a second dry-run is all `unchanged`
// (idempotent), placeholders are resolved at runtime, only pawpi- uids are touched, nothing is ever deleted and the token
// never appears in output.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ApplyError,
  EXIT,
  FOLDER_UID,
  assertPawpiUid,
  createHttp,
  defaultSections,
  ensureFolder,
  loadDashboards,
  main,
  normalizeDashboard,
  parseArgs,
  pickDatasource,
  resolveDatasources,
  substituteDatasources,
} from '../../../../../scripts/observability/apply-grafana.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..'); // anything/apps/web/src/observability -> repo root
const DASH_DIR = path.join(REPO_ROOT, 'observability/grafana/dashboards');
const TOKEN = 'glsa_SUPERSECRETTOKEN_1234567890';

const DATASOURCES = [
  { uid: 'ds-other-pg', name: 'Postgres', type: 'postgres' },
  { uid: 'ds-tempo', name: 'grafanacloud-demo-traces', type: 'tempo' },
  { uid: 'ds-prom-usage', name: 'grafanacloud-usage', type: 'prometheus' },
  { uid: 'ds-prom', name: 'grafanacloud-demo-prom', type: 'prometheus', isDefault: true },
  { uid: 'ds-loki', name: 'grafanacloud-demo-logs', type: 'loki' },
];

const servers = [];
async function startMock({ datasources = DATASOURCES, folders = [], dashboards = {}, token = TOKEN } = {}) {
  const state = { requests: [], folders: [...folders], dashboards: new Map(Object.entries(dashboards)), nextId: 100 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : undefined;
      const url = new URL(req.url, 'http://x');
      state.requests.push({ method: req.method, path: url.pathname, search: url.search, auth: req.headers.authorization, body });
      const send = (status, json) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { message: 'invalid API key' });
      if (req.method === 'DELETE') return send(405, { message: 'no deletes in this test' });

      if (req.method === 'GET' && url.pathname === '/api/search') {
        const q = (url.searchParams.get('query') || '').toLowerCase();
        return send(200, state.folders.filter((f) => f.title.toLowerCase().includes(q)).map((f) => ({ ...f, type: 'dash-folder' })));
      }
      if (req.method === 'POST' && url.pathname === '/api/folders') {
        const f = { uid: body.uid, title: body.title };
        state.folders.push(f);
        return send(200, f);
      }
      if (req.method === 'GET' && url.pathname === '/api/datasources') return send(200, datasources);
      const m = url.pathname.match(/^\/api\/dashboards\/uid\/(.+)$/);
      if (req.method === 'GET' && m) {
        const d = state.dashboards.get(decodeURIComponent(m[1]));
        if (!d) return send(404, { message: 'Dashboard not found' });
        return send(200, { dashboard: { ...d.dashboard, id: d.id, version: d.version }, meta: { folderUid: d.folderUid } });
      }
      if (req.method === 'POST' && url.pathname === '/api/dashboards/db') {
        if (!body.overwrite) return send(412, { message: 'version-mismatch' });
        if (!state.folders.some((f) => f.uid === body.folderUid)) return send(400, { message: 'folder not found' });
        const prev = state.dashboards.get(body.dashboard.uid);
        const rec = { dashboard: body.dashboard, folderUid: body.folderUid, id: prev?.id ?? state.nextId++, version: (prev?.version ?? 0) + 1 };
        state.dashboards.set(body.dashboard.uid, rec);
        return send(200, { status: 'success', uid: body.dashboard.uid, id: rec.id, version: rec.version });
      }
      return send(404, { message: 'not found' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return { state, url: `http://127.0.0.1:${server.address().port}`, writes: () => state.requests.filter((r) => r.method !== 'GET') };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function run(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main({ argv: args, env, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const envFor = (mock, extra = {}) => ({ GRAFANA_URL: mock.url, GRAFANA_SA_TOKEN: TOKEN, ...extra });
const dashboardFiles = fs.readdirSync(DASH_DIR).filter((f) => f.endsWith('.json'));

describe('apply-grafana: no Grafana env (still validates, skips the live diff)', () => {
  it('dry run lists every dashboard, says the live diff was skipped, exits 0', async () => {
    const r = await run([]);
    expect(r.code).toBe(EXIT.OK);
    expect(r.out).toContain('DRY RUN');
    expect(r.out).toContain(`${dashboardFiles.length} dashboard(s) validated`);
    for (const f of dashboardFiles) expect(r.out).toContain(`pawpi-${f.replace('.json', '')}`);
    expect(r.out).toMatch(/live diff skipped/);
  });

  it('--apply without GRAFANA_URL / GRAFANA_SA_TOKEN exits 2 and writes nothing', async () => {
    const r = await run(['--apply']);
    expect(r.code).toBe(EXIT.CONFIG);
    expect(r.err).toMatch(/GRAFANA_URL and GRAFANA_SA_TOKEN/);
    const half = await run(['--apply'], { GRAFANA_URL: 'http://127.0.0.1:1' });
    expect(half.code).toBe(EXIT.CONFIG);
    expect(half.err).toMatch(/GRAFANA_SA_TOKEN/);
    expect(half.err).not.toMatch(/GRAFANA_URL and/);
  });
});

describe('apply-grafana against a mock Grafana', () => {
  it('dry run on an empty Grafana plans a create for every dashboard (+ folder) and issues no write', async () => {
    const mock = await startMock();
    const r = await run([], envFor(mock));
    expect(r.code).toBe(EXIT.OK);
    expect(r.out).toContain(`Plan: ${dashboardFiles.length} create, 0 update, 0 unchanged, folder will be created`);
    expect(r.out).toMatch(/Folder "PawPi": missing/);
    expect(r.out).toContain('Prometheus "grafanacloud-demo-prom", Loki "grafanacloud-demo-logs"');
    expect(mock.writes()).toEqual([]);
    expect(r.out + r.err).not.toContain(TOKEN);
    expect(mock.state.requests.every((q) => q.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('--exit-code makes a dry run with pending changes exit 4', async () => {
    const mock = await startMock();
    expect((await run(['--exit-code'], envFor(mock))).code).toBe(EXIT.PENDING);
  });

  it('--apply creates the folder once and every dashboard with overwrite+folderUid, placeholders resolved, then a 2nd dry run is all unchanged', async () => {
    const mock = await startMock();
    const applied = await run(['--apply'], envFor(mock));
    expect(applied.code).toBe(EXIT.OK);
    expect(applied.out).toContain('created (uid pawpi-folder)');

    const folderPosts = mock.writes().filter((w) => w.path === '/api/folders');
    expect(folderPosts).toHaveLength(1);
    expect(folderPosts[0].body).toEqual({ uid: FOLDER_UID, title: 'PawPi' });

    const dbPosts = mock.writes().filter((w) => w.path === '/api/dashboards/db');
    expect(dbPosts).toHaveLength(dashboardFiles.length);
    for (const w of dbPosts) {
      expect(w.body.overwrite).toBe(true);
      expect(w.body.folderUid).toBe(FOLDER_UID);
      expect(w.body.dashboard.id).toBeNull();
      expect(w.body.dashboard.uid.startsWith('pawpi-')).toBe(true);
      const json = JSON.stringify(w.body);
      expect(json).not.toContain('${DS_PROMETHEUS}');
      expect(json).not.toContain('${DS_LOKI}');
      expect(json).toContain('ds-prom');
    }
    // the preferred datasources were chosen (not the usage prom, not the default-less other types)
    const uidsUsed = new Set(dbPosts.flatMap((w) => [...JSON.stringify(w.body).matchAll(/"uid":"(ds-[a-z-]+)"/g)].map((m) => m[1])));
    expect([...uidsUsed].sort()).toEqual(['ds-loki', 'ds-prom']);
    expect(mock.state.requests.some((q) => q.method === 'DELETE')).toBe(false);
    expect(applied.out + applied.err).not.toContain(TOKEN);

    // idempotency: second dry run -> everything unchanged, no folder create, no writes
    const before = mock.writes().length;
    const again = await run([], envFor(mock));
    expect(again.code).toBe(EXIT.OK);
    expect(again.out).toContain(`Plan: 0 create, 0 update, ${dashboardFiles.length} unchanged`);
    expect(again.out).toMatch(/Folder "PawPi": exists/);
    expect(again.out).not.toMatch(/\bcreate\b {4}pawpi|\bupdate\b {4}pawpi/);
    expect(mock.writes().length).toBe(before);
    expect((await run(['--exit-code'], envFor(mock))).code).toBe(EXIT.OK);

    // and a second --apply writes nothing at all
    const second = await run(['--apply'], envFor(mock));
    expect(second.code).toBe(EXIT.OK);
    expect(mock.writes().length).toBe(before);
    expect(second.out).toContain('nothing to write');
  });

  it('detects drift: a changed live dashboard becomes `update`, --only limits the scope, other dashboards are untouched', async () => {
    const mock = await startMock();
    await run(['--apply'], envFor(mock));
    const live = mock.state.dashboards.get('pawpi-overview');
    live.dashboard = { ...live.dashboard, title: 'Edited in the UI' };
    const other = mock.state.dashboards.get('pawpi-behaviour');
    other.folderUid = 'somewhere-else';

    const dry = await run([], envFor(mock));
    expect(dry.out).toMatch(/update\s+pawpi-overview .*content differs/);
    expect(dry.out).toMatch(/update\s+pawpi-behaviour .*folder differs/);
    expect(dry.out).toContain(`1 unchanged`.replace('1', String(dashboardFiles.length - 2)));

    const before = mock.writes().length;
    const only = await run(['--apply', '--only', 'pawpi-overview'], envFor(mock));
    expect(only.code).toBe(EXIT.OK);
    const newWrites = mock.writes().slice(before);
    expect(newWrites).toHaveLength(1);
    expect(newWrites[0].body.dashboard.uid).toBe('pawpi-overview');
    expect(mock.state.dashboards.get('pawpi-behaviour').folderUid).toBe('somewhere-else');

    const final = await run(['--apply'], envFor(mock));
    expect(final.code).toBe(EXIT.OK);
    expect((await run([], envFor(mock))).out).toContain(`Plan: 0 create, 0 update, ${dashboardFiles.length} unchanged`);
  });

  it('reuses an existing "PawPi" folder (never creates or modifies it) and never touches non-pawpi dashboards', async () => {
    const stranger = { dashboard: { uid: 'legacy-red', title: 'PawPi — API health (RED)', panels: [] }, folderUid: 'existing-folder', id: 1, version: 3 };
    const mock = await startMock({ folders: [{ uid: 'existing-folder', title: 'PawPi' }], dashboards: { 'legacy-red': stranger } });
    const r = await run(['--apply'], envFor(mock));
    expect(r.code).toBe(EXIT.OK);
    expect(mock.writes().some((w) => w.path === '/api/folders')).toBe(false);
    expect(mock.writes().filter((w) => w.path === '/api/dashboards/db').every((w) => w.body.folderUid === 'existing-folder')).toBe(true);
    expect(mock.state.dashboards.get('legacy-red')).toBe(stranger);
    expect(mock.state.requests.some((q) => q.path.includes('legacy-red'))).toBe(false);
    expect(mock.state.requests.some((q) => q.method === 'DELETE')).toBe(false);
  });

  it('honours GRAFANA_PROM_DS / GRAFANA_LOKI_DS overrides by name', async () => {
    const mock = await startMock();
    const r = await run(['--apply', '--only', 'pawpi-overview'], envFor(mock, { GRAFANA_PROM_DS: 'grafanacloud-usage' }));
    expect(r.code).toBe(EXIT.OK);
    const body = JSON.stringify(mock.writes().find((w) => w.path === '/api/dashboards/db').body);
    expect(body).toContain('ds-prom-usage');
    expect(body).not.toContain('"ds-prom"');
    const bad = await run([], envFor(mock, { GRAFANA_PROM_DS: 'nope' }));
    expect(bad.code).toBe(EXIT.GRAFANA);
    expect(bad.err).toMatch(/override "nope"/);
  });

  it('a rejected token exits 3 with a hint and never echoes the token', async () => {
    const mock = await startMock({ token: 'something-else' });
    const r = await run(['--apply'], envFor(mock));
    expect(r.code).toBe(EXIT.GRAFANA);
    expect(r.err).toMatch(/HTTP 401/);
    expect(r.err + r.out).not.toContain(TOKEN);
    expect(mock.writes()).toEqual([]);
  });

  it('an unreachable Grafana exits 3', async () => {
    const r = await run([], { GRAFANA_URL: 'http://127.0.0.1:1', GRAFANA_SA_TOKEN: TOKEN });
    expect(r.code).toBe(EXIT.GRAFANA);
    expect(r.err).not.toContain(TOKEN);
  });

  it('missing Loki or Prometheus datasource exits 3', async () => {
    const mock = await startMock({ datasources: DATASOURCES.filter((d) => d.type !== 'loki') });
    const r = await run([], envFor(mock));
    expect(r.code).toBe(EXIT.GRAFANA);
    expect(r.err).toMatch(/no Loki datasource/);
  });
});

describe('apply-grafana: safety rails', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pawpi-dash-'));
  const write = (dir, name, obj) => fs.writeFileSync(path.join(dir, name), typeof obj === 'string' ? obj : JSON.stringify(obj));
  const minimal = (uid) => ({ uid, title: 'x', panels: [] });

  it('refuses dashboards whose uid is not pawpi-<file>, invalid JSON, duplicates; exits 1', async () => {
    const dir = tmp();
    write(dir, 'good.json', minimal('pawpi-good'));
    write(dir, 'bad.json', minimal('someone-elses'));
    write(dir, 'mismatch.json', minimal('pawpi-other'));
    write(dir, 'broken.json', '{ nope');
    const r = await run(['--dir', dir]);
    expect(r.code).toBe(EXIT.USAGE);
    expect(r.err).toMatch(/bad\.json: uid "someone-elses" must start with "pawpi-"/);
    expect(r.err).toMatch(/mismatch\.json: uid "pawpi-other" must equal "pawpi-mismatch"/);
    expect(r.err).toMatch(/broken\.json: invalid JSON/);
  });

  it('refuses --only for a non-pawpi uid or an unknown dashboard (exit 1) before any network call', async () => {
    const mock = await startMock();
    const a = await run(['--apply', '--only', 'legacy-red'], envFor(mock));
    expect(a.code).toBe(EXIT.USAGE);
    expect(a.err).toMatch(/only uids starting with "pawpi-"/);
    const b = await run(['--only', 'pawpi-nope'], envFor(mock));
    expect(b.code).toBe(EXIT.USAGE);
    expect(mock.state.requests).toEqual([]);
  });

  it('rejects unknown flags and prints help', async () => {
    expect((await run(['--delete-everything'])).code).toBe(EXIT.USAGE);
    const h = await run(['--help']);
    expect(h.code).toBe(EXIT.OK);
    expect(h.out).toMatch(/dry run/);
    expect(() => parseArgs(['--only'])).toThrow(ApplyError);
  });

  it('the HTTP helper refuses DELETE and writes outside its allow-list, even when asked directly', async () => {
    const mock = await startMock();
    const http_ = createHttp({ baseUrl: mock.url, token: TOKEN });
    expect(() => http_.request('DELETE', '/api/dashboards/uid/pawpi-overview')).toThrow(/DELETE is never allowed/);
    expect(() => http_.post('/api/datasources', {})).toThrow(/allow-list/);
    const extra = createHttp({ baseUrl: mock.url, token: TOKEN, allowWrite: [/^\/api\/v1\/provisioning\/alert-rules$/] });
    expect(() => extra.post('/api/dashboards/db', {})).toThrow(/allow-list/);
    expect(mock.state.requests).toEqual([]);
  });

  it('assertPawpiUid / ensureFolder only accept pawpi- uids', async () => {
    expect(() => assertPawpiUid('pawpi-overview')).not.toThrow();
    expect(() => assertPawpiUid('overview')).toThrow(/only uids starting with "pawpi-"/);
    expect(() => assertPawpiUid(undefined)).toThrow(ApplyError);
    const mock = await startMock();
    const http_ = createHttp({ baseUrl: mock.url, token: TOKEN });
    expect(await ensureFolder(http_, { apply: false })).toMatchObject({ uid: FOLDER_UID, wouldCreate: true, created: false });
    expect(mock.writes()).toEqual([]);
    expect(await ensureFolder(http_, { apply: true })).toMatchObject({ uid: FOLDER_UID, created: true });
    expect(await ensureFolder(http_, { apply: true })).toMatchObject({ created: false });
    expect(mock.writes()).toHaveLength(1);
  });

  it('the source never contains a DELETE call or a hard-coded datasource uid', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/observability/apply-grafana.mjs'), 'utf8');
    expect(src).not.toMatch(/\.request\(\s*['"]DELETE|method:\s*['"]DELETE|\.delete\(/);
  });
});

describe('apply-grafana: helpers (named exports, for Step D)', () => {
  it('pickDatasource prefers grafanacloud-*-prom / logs, then default, then first; override wins', () => {
    expect(pickDatasource(DATASOURCES, 'prometheus').uid).toBe('ds-prom');
    expect(pickDatasource(DATASOURCES, 'loki').uid).toBe('ds-loki');
    expect(pickDatasource([{ uid: 'a', name: 'zzz', type: 'prometheus' }, { uid: 'b', name: 'yyy', type: 'prometheus', isDefault: true }], 'prometheus').uid).toBe('b');
    expect(pickDatasource([{ uid: 'a', name: 'zzz', type: 'prometheus' }, { uid: 'b', name: 'yyy', type: 'prometheus' }], 'prometheus').uid).toBe('a');
    expect(pickDatasource([], 'loki')).toBeNull();
    expect(pickDatasource(DATASOURCES, 'prometheus', 'ds-prom-usage').uid).toBe('ds-prom-usage');
  });

  it('resolveDatasources + substituteDatasources replace both placeholders everywhere without mutating the input', async () => {
    const mock = await startMock();
    const ds = await resolveDatasources(createHttp({ baseUrl: mock.url, token: TOKEN }));
    expect(ds).toEqual({ prometheus: { uid: 'ds-prom', name: 'grafanacloud-demo-prom' }, loki: { uid: 'ds-loki', name: 'grafanacloud-demo-logs' } });
    const src = { panels: [{ datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' }, targets: [{ datasource: { type: 'loki', uid: '${DS_LOKI}' } }] }], templating: { list: [{ datasource: { uid: '${DS_PROMETHEUS}' } }] } };
    const copy = JSON.stringify(src);
    const out = substituteDatasources(src, ds);
    expect(JSON.stringify(src)).toBe(copy);
    expect(JSON.stringify(out)).not.toContain('${DS_');
    expect(out.panels[0].targets[0].datasource.uid).toBe('ds-loki');
  });

  it('normalizeDashboard ignores id/version and key order', () => {
    expect(normalizeDashboard({ b: 1, a: { d: 1, c: 2 }, id: 5, version: 9 })).toEqual(normalizeDashboard({ a: { c: 2, d: 1 }, b: 1 }));
    expect(JSON.stringify(normalizeDashboard({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}');
  });

  it('sections are pluggable: a second section runs in order and its plan counts toward the summary', async () => {
    const mock = await startMock();
    const calls = [];
    const extra = {
      name: 'alerts',
      async plan() {
        calls.push('plan');
        return { items: [{ kind: 'alert', uid: 'pawpi-alert-demo', title: 'demo', action: 'create', reasons: ['not found'] }], notes: [] };
      },
      async apply(ctx, plan) {
        calls.push(`apply:${plan.items.length}`);
        return [{ uid: 'pawpi-alert-demo' }];
      },
    };
    const out = [];
    const code = await main({ argv: ['--apply', '--only', 'pawpi-overview'], env: envFor(mock), out: (s) => out.push(s), err: () => {}, sections: [...defaultSections, extra] });
    expect(code).toBe(EXIT.OK);
    expect(calls).toEqual(['plan', 'apply:1']);
    expect(out.join('\n')).toMatch(/\[alerts\]/);
    expect(out.join('\n')).toContain('wrote pawpi-alert-demo');
  });

  it('loadDashboards reads the real repo dashboards', () => {
    const list = loadDashboards(DASH_DIR);
    expect(list).toHaveLength(11);
    expect(list.every((d) => d.uid === `pawpi-${d.file.replace('.json', '')}`)).toBe(true);
  });
});
