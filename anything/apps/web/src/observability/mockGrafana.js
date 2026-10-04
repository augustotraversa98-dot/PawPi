// Local mock Grafana + Synthetic Monitoring servers (node:http on 127.0.0.1) for the Step D apply tests.
// Not a test file (not matched by vitest's include); imported by apply-alerts.test.js and apply-synthetics.test.js.
import http from 'node:http';

export const TOKEN = 'glsa_SUPERSECRETTOKEN_1234567890';

export const DATASOURCES = [
  { uid: 'ds-other-pg', name: 'Postgres', type: 'postgres' },
  { uid: 'ds-tempo', name: 'grafanacloud-demo-traces', type: 'tempo' },
  { uid: 'ds-prom-usage', name: 'grafanacloud-demo-usage', type: 'prometheus' },
  { uid: 'ds-prom', name: 'grafanacloud-demo-prom', type: 'prometheus', isDefault: true },
  { uid: 'ds-loki', name: 'grafanacloud-demo-logs', type: 'loki' },
  { uid: 'ds-usage-insights', name: 'grafanacloud-demo-usage-insights', type: 'loki' },
];

/** A notification tree like the live one: a legacy folder route, a nested route in legacy string-matcher syntax. */
export function legacyTree() {
  return {
    receiver: 'Augusto',
    group_by: ['grafana_folder', 'alertname'],
    group_wait: '30s',
    group_interval: '5m',
    repeat_interval: '4h',
    provenance: '',
    routes: [
      { receiver: 'Augusto', object_matchers: [['grafana_folder', '=', 'PawPi']], group_wait: '45s', repeat_interval: '4h', routes: [{ receiver: 'Augusto', object_matchers: [['severity', '=', 'critical']] }] },
      { receiver: 'ops-pager', matchers: ['team=ops'], continue: true, mute_time_intervals: ['nights'] },
    ],
  };
}

export const LEGACY_CONTACTS = [
  { uid: 'aug-email', name: 'Augusto', type: 'email', settings: { addresses: 'owner@example.invalid' } },
  { uid: 'aug-webhook', name: 'Augusto', type: 'webhook', settings: { url: 'https://example.invalid/hook' } },
  { uid: 'ops', name: 'ops-pager', type: 'email', settings: { addresses: 'ops@example.invalid' } },
];

const servers = [];
export async function closeMocks() {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
}

function serve(handler) {
  return new Promise((resolve) => {
    const state = { requests: [] };
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : undefined;
        const url = new URL(req.url, 'http://x');
        const rec = { method: req.method, path: url.pathname, search: url.search, auth: req.headers.authorization, headers: req.headers, body };
        state.requests.push(rec);
        const send = (status, json) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(json));
        };
        handler({ req, rec, url, body, send, state });
      });
    });
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      resolve({ state, url: `http://127.0.0.1:${server.address().port}`, writes: () => state.requests.filter((r) => r.method !== 'GET') });
    });
  });
}

/**
 * Mock Grafana: folders, datasources, dashboards (minimal), provisioning alert rules, contact points and the policy tree.
 * `state.rules` (uid -> rule), `state.tree`, `state.contacts`, `state.folders` can be inspected and mutated by tests.
 */
export function startGrafana({ datasources = DATASOURCES, folders = [{ uid: 'f-pawpi', title: 'PawPi' }], rules = {}, tree = legacyTree(), contacts = LEGACY_CONTACTS, token = TOKEN } = {}) {
  let nextId = 100;
  return serve(({ req, rec, url, body, send, state }) => {
    state.folders ??= [...folders];
    state.rules ??= new Map(Object.entries(rules));
    state.tree ??= JSON.parse(JSON.stringify(tree));
    state.contacts ??= JSON.parse(JSON.stringify(contacts));
    state.dashboards ??= new Map();
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { message: 'invalid API key' });
    if (req.method === 'DELETE') return send(405, { message: 'no deletes in this test' });
    const p = url.pathname;
    const provenance = req.headers['x-disable-provenance'] === 'true' ? '' : 'api';

    if (req.method === 'GET' && p === '/api/search') {
      const q = (url.searchParams.get('query') || '').toLowerCase();
      return send(200, state.folders.filter((f) => f.title.toLowerCase().includes(q)).map((f) => ({ ...f, type: 'dash-folder' })));
    }
    if (req.method === 'POST' && p === '/api/folders') {
      state.folders.push({ uid: body.uid, title: body.title });
      return send(200, { uid: body.uid, title: body.title });
    }
    if (req.method === 'GET' && p === '/api/datasources') return send(200, datasources);
    const dm = p.match(/^\/api\/dashboards\/uid\/(.+)$/);
    if (req.method === 'GET' && dm) {
      const d = state.dashboards.get(decodeURIComponent(dm[1]));
      return d ? send(200, { dashboard: { ...d.dashboard, id: d.id, version: d.version }, meta: { folderUid: d.folderUid } }) : send(404, { message: 'Dashboard not found' });
    }
    if (req.method === 'POST' && p === '/api/dashboards/db') {
      const prev = state.dashboards.get(body.dashboard.uid);
      const r = { dashboard: body.dashboard, folderUid: body.folderUid, id: prev?.id ?? nextId++, version: (prev?.version ?? 0) + 1 };
      state.dashboards.set(body.dashboard.uid, r);
      return send(200, { status: 'success', uid: body.dashboard.uid, id: r.id, version: r.version });
    }

    // ---- alert rules (provisioning API)
    const rm = p.match(/^\/api\/v1\/provisioning\/alert-rules\/(.+)$/);
    if (req.method === 'GET' && rm) {
      const r = state.rules.get(decodeURIComponent(rm[1]));
      return r ? send(200, r) : send(404, { message: 'alert rule not found' });
    }
    if (req.method === 'POST' && p === '/api/v1/provisioning/alert-rules') {
      if (!state.folders.some((f) => f.uid === body.folderUID)) return send(400, { message: 'folder not found' });
      if (state.rules.has(body.uid)) return send(409, { message: 'rule exists' });
      const r = { ...body, id: nextId++, orgID: 1, provenance, updated: '2026-10-04T00:00:00Z' };
      state.rules.set(body.uid, r);
      return send(201, r);
    }
    if (req.method === 'PUT' && rm) {
      const uid = decodeURIComponent(rm[1]);
      if (!state.rules.has(uid)) return send(404, { message: 'alert rule not found' });
      const prev = state.rules.get(uid);
      const r = { ...body, uid, id: prev.id, orgID: 1, provenance: prev.provenance, updated: '2026-10-04T01:00:00Z' };
      state.rules.set(uid, r);
      return send(200, r);
    }

    // ---- contact points
    if (req.method === 'GET' && p === '/api/v1/provisioning/contact-points') return send(200, state.contacts);
    if (req.method === 'POST' && p === '/api/v1/provisioning/contact-points') {
      if (state.contacts.some((c) => c.uid === body.uid)) return send(409, { message: 'exists' });
      state.contacts.push({ ...body, provenance });
      return send(202, body);
    }
    const cm = p.match(/^\/api\/v1\/provisioning\/contact-points\/(.+)$/);
    if (req.method === 'PUT' && cm) {
      const i = state.contacts.findIndex((c) => c.uid === cm[1]);
      if (i < 0) return send(404, { message: 'not found' });
      state.contacts[i] = { ...body, provenance };
      return send(202, body);
    }

    // ---- policy tree
    if (req.method === 'GET' && p === '/api/v1/provisioning/policies') return send(200, state.tree);
    if (req.method === 'PUT' && p === '/api/v1/provisioning/policies') {
      const receivers = new Set(state.contacts.map((c) => c.name));
      const bad = [];
      const walk = (r) => {
        if (!receivers.has(r.receiver)) bad.push(r.receiver);
        (r.routes ?? []).forEach(walk);
      };
      walk(body);
      if (bad.length) return send(400, { message: `unknown receiver ${bad.join(',')}` });
      state.tree = { ...body, provenance };
      return send(202, { message: 'policies updated' });
    }
    return send(404, { message: 'not found' });
  });
}

export const PROBES = [
  { id: 11, name: 'Frankfurt', region: 'EMEA', public: true, online: true },
  { id: 12, name: 'Amsterdam', region: 'EMEA', public: true, online: true },
  { id: 13, name: 'London', region: 'EMEA', public: true, online: false },
  { id: 21, name: 'NewYork', region: 'AMER', public: true, online: true },
  { id: 22, name: 'Atlanta', region: 'AMER', public: true, online: true },
  { id: 31, name: 'Tokyo', region: 'APAC', public: true, online: true },
  { id: 99, name: 'private-box', region: 'EMEA', public: false, online: true },
];

/** Mock Synthetic Monitoring API. `state.checks` is a Map(id -> check). */
export function startSm({ checks = [], probes = PROBES, token = 'sm_TOKEN_abcdef' } = {}) {
  let nextId = 500;
  return serve(({ req, url, body, send, state }) => {
    state.checks ??= new Map(checks.map((c) => [c.id, c]));
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { err: 'unauthorized' });
    if (req.method === 'DELETE') return send(405, { err: 'no deletes in this test' });
    const p = url.pathname;
    if (req.method === 'GET' && p === '/api/v1/check/list') return send(200, [...state.checks.values()]);
    if (req.method === 'GET' && p === '/api/v1/probe/list') return send(200, probes);
    if (req.method === 'POST' && p === '/api/v1/check/add') {
      const c = { ...body, id: nextId++, tenantId: 7, created: 1, modified: 1 };
      state.checks.set(c.id, c);
      return send(200, c);
    }
    if (req.method === 'POST' && p === '/api/v1/check/update') {
      if (!state.checks.has(body.id)) return send(404, { err: 'not found' });
      const c = { ...state.checks.get(body.id), ...body, modified: 2 };
      state.checks.set(c.id, c);
      return send(200, c);
    }
    return send(404, { err: 'not found' });
  });
}
