// @vitest-environment node
// Step D: the alerts + policies sections of scripts/observability/apply-grafana.mjs against a LOCAL mock Grafana.
// Proves: dry-run writes nothing; rules are created PAUSED; an update NEVER changes the live pause state; only pawpi-
// uids are written; the shared notification tree is MERGED (every existing route preserved, ours in front); Augusto is
// never written; the digest contact point needs ALERT_DIGEST_EMAIL; idempotent; nothing is ever deleted.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ApplyError,
  EXIT,
  POLICY_ROUTES,
  PLACEHOLDERS,
  alertsSection,
  assertPolicyPreserved,
  createHttp,
  loadAlerts,
  main,
  mergePolicyTree,
  parseArgs,
  parseDigestEmails,
  pickUsageDatasource,
  routeIdentity,
  sameMap,
  subsetEqual,
  ALERT_WRITE_ALLOW,
  POLICY_WRITE_ALLOW,
} from '../../../../../scripts/observability/apply-grafana.mjs';
import { DATASOURCES, LEGACY_CONTACTS, TOKEN, closeMocks, legacyTree, startGrafana } from './mockGrafana.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const ALERTS_DIR = path.join(REPO_ROOT, 'observability/grafana/alerts');
afterEach(closeMocks);

const EMAILS = 'owner@example.invalid; second@example.invalid';
const envFor = (mock, extra = {}) => ({ GRAFANA_URL: mock.url, GRAFANA_SA_TOKEN: TOKEN, ...extra });
async function run(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main({ argv: args, env, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const ruleCount = loadAlerts(ALERTS_DIR).length;
const SECTIONS = ['--sections', 'alerts,policies'];

describe('alerts section: repo files', () => {
  it('loads every rule, all paused, all pawpi- uids', () => {
    const rules = loadAlerts(ALERTS_DIR);
    expect(rules).toHaveLength(15);
    for (const r of rules) {
      expect(r.uid.startsWith('pawpi-')).toBe(true);
      expect(r.rule.isPaused).toBe(true);
    }
  });

  it('refuses unpaused rules, foreign uids and a missing folder declaration (exit 1)', async () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'pawpi-alerts-'));
    const good = JSON.parse(fs.readFileSync(path.join(ALERTS_DIR, 'p1-critical.json'), 'utf8'));
    const rule = good.groups[0].rules[0];
    fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ apiVersion: 1, groups: [{ name: 'someone-elses', folder: 'Other', rules: [{ ...rule, uid: 'legacy-rule', isPaused: false }] }] }));
    const r = await run([...SECTIONS, '--alerts-dir', dir]);
    expect(r.code).toBe(EXIT.USAGE);
    expect(r.err).toMatch(/group "someone-elses" must start with "pawpi-"/);
    expect(r.err).toMatch(/must declare folder "PawPi"/);
    expect(r.err).toMatch(/rule uid "legacy-rule" must start with "pawpi-"/);
    expect(r.err).toMatch(/isPaused must be true/);
  });
});

describe('dry run', () => {
  it('without Grafana env: lists rules + routing, says the live diff is skipped, exits 0', async () => {
    const r = await run(SECTIONS);
    expect(r.code).toBe(EXIT.OK);
    expect(r.out).toContain('Sections: alerts, policies');
    expect(r.out).toContain('pawpi-p1-http-5xx-rate');
    expect(r.out).toContain('pawpi-policy-p1');
    expect(r.out).toMatch(/live diff skipped/);
  });

  it('--apply without env exits 2', async () => {
    expect((await run([...SECTIONS, '--apply'])).code).toBe(EXIT.CONFIG);
  });

  it('on an empty Grafana plans a create per rule + the P1 route, skips digest + P2 without ALERT_DIGEST_EMAIL, writes nothing', async () => {
    const mock = await startGrafana();
    const r = await run(SECTIONS, envFor(mock));
    expect(r.code).toBe(EXIT.OK);
    expect(r.out).toContain(`Plan: ${ruleCount + 1} create, 0 update, 0 unchanged, 2 skipped`);
    expect(r.out).toMatch(/skipped\s+pawpi-digest/);
    expect(r.out).toMatch(/ALERT_DIGEST_EMAIL is not set/);
    expect(r.out).toMatch(/skipped\s+pawpi-policy-p2/);
    expect(r.out).toMatch(/do NOT un-pause P2 rules/);
    expect(mock.writes()).toEqual([]);
    expect(r.out + r.err).not.toContain(TOKEN);
  });

  it('the default sections (no --sections) never touch alerts or routing', async () => {
    const mock = await startGrafana();
    const r = await run([], envFor(mock));
    expect(r.code).toBe(EXIT.OK);
    expect(mock.state.requests.some((q) => q.path.includes('/provisioning/'))).toBe(false);
    expect(r.out).not.toContain('[alerts]');
  });

  it('--sections validates names and --only works across sections', async () => {
    expect((await run(['--sections', 'bogus'])).code).toBe(EXIT.USAGE);
    expect(() => parseArgs(['--sections'])).toThrow(ApplyError);
    expect(parseArgs(['--sections', 'all']).sections).toEqual(['dashboards', 'alerts', 'policies', 'synthetics']);
    expect(parseArgs(['--sections=policies,alerts']).sections).toEqual(['alerts', 'policies']);
    const mock = await startGrafana();
    const one = await run([...SECTIONS, '--only', 'pawpi-p1-http-5xx-rate'], envFor(mock));
    expect(one.code).toBe(EXIT.OK);
    expect(one.out).toContain('pawpi-p1-http-5xx-rate');
    expect(one.out).not.toContain('pawpi-p1-db-errors');
    const none = await run([...SECTIONS, '--only', 'pawpi-nope'], envFor(mock));
    expect(none.code).toBe(EXIT.USAGE);
    const foreign = await run([...SECTIONS, '--only', 'legacy-rule'], envFor(mock));
    expect(foreign.code).toBe(EXIT.USAGE);
  });
});

describe('--apply: rules are created paused, routing is merged, everything idempotent', () => {
  it('creates every rule PAUSED with provenance header, resolved datasources, in the PawPi folder', async () => {
    const mock = await startGrafana();
    const r = await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    expect(r.code).toBe(EXIT.OK);
    const posts = mock.writes().filter((w) => w.path === '/api/v1/provisioning/alert-rules');
    expect(posts).toHaveLength(ruleCount);
    for (const w of posts) {
      expect(w.method).toBe('POST');
      expect(w.headers['x-disable-provenance']).toBe('true');
      expect(w.body.isPaused).toBe(true);
      expect(w.body.uid.startsWith('pawpi-')).toBe(true);
      expect(w.body.folderUID).toBe('f-pawpi');
      expect(w.body.ruleGroup).toMatch(/^pawpi-p[12]-/);
      expect(w.body.labels.pawpi_managed).toBe('true');
      const json = JSON.stringify(w.body);
      expect(json).not.toMatch(/\$\{DS_/);
      expect(json).toMatch(/ds-prom/);
      expect(w.body.noDataState).toBe('OK');
    }
    // the usage rule reads the usage datasource, not the main one (and not the Loki "usage-insights" one)
    const usage = posts.find((w) => w.body.uid === 'pawpi-p2-free-tier-usage');
    expect(usage.body.data[0].datasourceUid).toBe('ds-prom-usage');
    expect(posts.find((w) => w.body.uid === 'pawpi-p1-http-5xx-rate').body.data[0].datasourceUid).toBe('ds-prom');
    expect(mock.state.requests.some((q) => q.method === 'DELETE')).toBe(false);
    expect(r.out + r.err).not.toContain(TOKEN);
    expect(r.out + r.err).not.toContain('owner@example.invalid'); // addresses are never printed
    expect([...mock.state.rules.values()].every((x) => x.isPaused === true)).toBe(true);
  });

  it('writes only to pawpi- paths: rules, contact point pawpi-digest, the policy tree (never Augusto)', async () => {
    const mock = await startGrafana();
    await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    const paths = new Set(mock.writes().map((w) => `${w.method} ${w.path}`));
    expect(paths.has('POST /api/v1/provisioning/contact-points')).toBe(true);
    expect(paths.has('PUT /api/v1/provisioning/policies')).toBe(true);
    for (const w of mock.writes()) {
      expect(w.path).toMatch(/^\/api\/v1\/provisioning\/(alert-rules|contact-points|policies)$/);
    }
    const cpWrites = mock.writes().filter((w) => w.path.includes('contact-points'));
    expect(cpWrites).toHaveLength(1);
    expect(cpWrites[0].body).toMatchObject({ uid: 'pawpi-digest', name: 'pawpi-digest', type: 'email' });
    expect(cpWrites[0].body.settings.addresses).toBe('owner@example.invalid;second@example.invalid');
    expect(cpWrites[0].headers['x-disable-provenance']).toBe('true');
    // Augusto's integrations are byte-identical
    expect(mock.state.contacts.filter((c) => c.name === 'Augusto')).toEqual(legacyContactsAugusto());
  });

  it('a second dry run is all unchanged and a second --apply writes nothing', async () => {
    const mock = await startGrafana();
    const env = envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS });
    await run([...SECTIONS, '--apply'], env);
    const before = mock.writes().length;
    const again = await run([...SECTIONS, '--exit-code'], env);
    expect(again.code).toBe(EXIT.OK);
    expect(again.out).toContain(`Plan: 0 create, 0 update, ${ruleCount + 3} unchanged`);
    expect(again.out).not.toMatch(/\b(create|update)\s{2,}pawpi/);
    const second = await run([...SECTIONS, '--apply'], env);
    expect(second.code).toBe(EXIT.OK);
    expect(mock.writes().length).toBe(before);
    expect(second.out).toContain('nothing to write');
  });

  it('PAUSE SEMANTICS: an update keeps the live pause state, an un-paused unchanged rule is left alone', async () => {
    const mock = await startGrafana();
    const env = envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS });
    await run([...SECTIONS, '--apply'], env);

    // the owner resumes two rules by hand; one of them (and one paused rule) drifts from the repo
    const resumedDrifted = mock.state.rules.get('pawpi-p1-http-5xx-rate');
    resumedDrifted.isPaused = false;
    resumedDrifted.for = '1m';
    const resumedSame = mock.state.rules.get('pawpi-p1-db-errors');
    resumedSame.isPaused = false;
    const pausedDrifted = mock.state.rules.get('pawpi-p2-slow-routes');
    pausedDrifted.annotations = { ...pausedDrifted.annotations, summary: 'edited in the UI' };

    const dry = await run(SECTIONS, env);
    expect(dry.out).toMatch(/update\s+pawpi-p1-http-5xx-rate .*for differs.*keeps live pause state: ACTIVE/);
    expect(dry.out).toMatch(/update\s+pawpi-p2-slow-routes .*annotations differ.*keeps live pause state: paused/);
    expect(dry.out).toMatch(/unchanged\s+pawpi-p1-db-errors/);
    expect(dry.out).toMatch(/2 managed rule\(s\) are currently un-paused/);

    const before = mock.writes().length;
    const applied = await run([...SECTIONS, '--apply'], env);
    expect(applied.code).toBe(EXIT.OK);
    const puts = mock.writes().slice(before);
    expect(puts.map((w) => `${w.method} ${w.path}`).sort()).toEqual([
      'PUT /api/v1/provisioning/alert-rules/pawpi-p1-http-5xx-rate',
      'PUT /api/v1/provisioning/alert-rules/pawpi-p2-slow-routes',
    ]);
    const active = puts.find((w) => w.path.endsWith('pawpi-p1-http-5xx-rate'));
    expect(active.body.isPaused).toBe(false); // NOT re-paused
    expect(active.body.for).toBe('5m'); // content restored from the repo
    const paused = puts.find((w) => w.path.endsWith('pawpi-p2-slow-routes'));
    expect(paused.body.isPaused).toBe(true); // NOT un-paused
    expect(mock.state.rules.get('pawpi-p1-http-5xx-rate').isPaused).toBe(false);
    expect(mock.state.rules.get('pawpi-p1-db-errors').isPaused).toBe(false);
    expect(mock.state.rules.get('pawpi-p2-slow-routes').isPaused).toBe(true);
    expect(mock.state.rules.get('pawpi-p2-slow-routes').annotations.summary).not.toBe('edited in the UI');
    // and the following dry run is clean again (pause state is not part of the comparison)
    expect((await run(SECTIONS, env)).out).toContain(`Plan: 0 create, 0 update, ${ruleCount + 3} unchanged`);
  });

  it('never touches rules it does not own (legacy rules are never even fetched)', async () => {
    const legacy = { uid: 'abc123legacy', title: 'HighServerErrorRate', isPaused: false, folderUID: 'f-pawpi', ruleGroup: 'PawPi', labels: { severity: 'critical' } };
    const mock = await startGrafana({ rules: { abc123legacy: legacy } });
    await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    expect(mock.state.rules.get('abc123legacy')).toBe(legacy);
    expect(mock.state.requests.some((q) => q.path.includes('abc123legacy'))).toBe(false);
  });

  it('skips the usage rule (and says why) when there is no usage datasource', async () => {
    const mock = await startGrafana({ datasources: DATASOURCES.filter((d) => d.uid !== 'ds-prom-usage') });
    const dry = await run(['--sections', 'alerts'], envFor(mock));
    expect(dry.out).toMatch(/skipped\s+pawpi-p2-free-tier-usage .*usage datasource/);
    await run(['--sections', 'alerts', '--apply'], envFor(mock));
    expect(mock.state.rules.has('pawpi-p2-free-tier-usage')).toBe(false);
    expect(mock.state.rules.size).toBe(ruleCount - 1);
  });
});

describe('notification policy merge', () => {
  const idsOf = (tree) => tree.routes.map(routeIdentity);

  it('adds P1 + P2 in FRONT, preserves every existing route and the root exactly, strips provenance, uses the header', async () => {
    const mock = await startGrafana();
    const original = legacyTree();
    await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    const put = mock.writes().find((w) => w.path === '/api/v1/provisioning/policies');
    expect(put.headers['x-disable-provenance']).toBe('true');
    expect('provenance' in put.body).toBe(false);
    const tree = mock.state.tree;
    expect(tree.routes).toHaveLength(original.routes.length + 2);
    expect(tree.routes[0]).toMatchObject({ receiver: 'Augusto', group_by: ['area', 'alertname'] });
    expect(tree.routes[0].object_matchers).toEqual([['pawpi_managed', '=', 'true'], ['severity', '=', 'P1']]);
    expect(tree.routes[1]).toMatchObject({ receiver: 'pawpi-digest', group_by: ['area'], group_interval: '24h' });
    expect(tree.routes.slice(2)).toEqual(original.routes); // legacy routes: deep-equal, same order, string matchers untouched
    const { routes, provenance, ...root } = tree; // eslint-disable-line no-unused-vars
    const { routes: r0, provenance: p0, ...root0 } = original; // eslint-disable-line no-unused-vars
    expect(root).toEqual(root0);
  });

  it('without ALERT_DIGEST_EMAIL only the P1 route is added', async () => {
    const mock = await startGrafana();
    await run([...SECTIONS, '--apply'], envFor(mock));
    expect(mock.state.tree.routes).toHaveLength(3);
    expect(mock.state.tree.routes[0].receiver).toBe('Augusto');
    expect(mock.state.contacts.some((c) => c.name === 'pawpi-digest')).toBe(false);
    expect(mock.writes().some((w) => w.path.includes('contact-points'))).toBe(false);
    // a later run WITH the email adds digest + P2 in front; P1 and every legacy route stay as they were
    const p1 = mock.state.tree.routes[0];
    await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    expect(mock.state.tree.routes).toHaveLength(4);
    expect(mock.state.tree.routes[0].receiver).toBe('pawpi-digest');
    expect(mock.state.tree.routes[1]).toEqual(p1);
    expect(mock.state.tree.routes.slice(2)).toEqual(legacyTree().routes);
  });

  it('an invalid ALERT_DIGEST_EMAIL counts as unset', async () => {
    expect(parseDigestEmails('not-an-email, a@b.co;a@b.co  c@d.org')).toEqual(['a@b.co', 'c@d.org']);
    const mock = await startGrafana();
    const r = await run(SECTIONS, envFor(mock, { ALERT_DIGEST_EMAIL: 'nonsense' }));
    expect(r.out).toMatch(/skipped\s+pawpi-digest/);
  });

  it('restores our own route when it was edited, keeping what the owner added under it; others untouched', async () => {
    const mock = await startGrafana();
    const env = envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS });
    await run([...SECTIONS, '--apply'], env);
    const p1 = mock.state.tree.routes[0];
    p1.repeat_interval = '1h';
    p1.routes = [{ receiver: 'Augusto', object_matchers: [['area', '=', 'auth']] }];
    p1.mute_time_intervals = ['nights'];
    const dry = await run(SECTIONS, env);
    expect(dry.out).toMatch(/update\s+pawpi-policy-p1/);
    await run([...SECTIONS, '--apply'], env);
    const fixed = mock.state.tree.routes[0];
    expect(fixed.repeat_interval).toBe('4h');
    expect(fixed.routes).toEqual([{ receiver: 'Augusto', object_matchers: [['area', '=', 'auth']] }]);
    expect(fixed.mute_time_intervals).toEqual(['nights']);
    expect(mock.state.tree.routes.slice(2)).toEqual(legacyTree().routes);
    expect((await run(SECTIONS, env)).out).toContain('0 update');
  });

  it('a P1 route that the owner moved down the list is updated in place, not duplicated', async () => {
    const mock = await startGrafana();
    const env = envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS });
    await run([...SECTIONS, '--apply'], env);
    const [p1, p2, ...rest] = mock.state.tree.routes;
    mock.state.tree.routes = [p2, ...rest, { ...p1, group_wait: '1s' }];
    await run([...SECTIONS, '--apply'], env);
    expect(mock.state.tree.routes).toHaveLength(legacyTree().routes.length + 2);
    expect(mock.state.tree.routes.at(-1).group_wait).toBe('30s');
  });

  it('refuses (exit 3, nothing written) when contact point Augusto does not exist', async () => {
    const mock = await startGrafana({ contacts: [{ uid: 'x', name: 'someone', type: 'email', settings: {} }], tree: { receiver: 'someone', routes: [] } });
    const r = await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    expect(r.code).toBe(EXIT.GRAFANA);
    expect(r.err).toMatch(/contact point "Augusto" not found/);
    expect(mock.writes()).toEqual([]);
  });

  it('updates the digest contact point addresses when they change, never printing them', async () => {
    const mock = await startGrafana();
    await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    const r = await run(SECTIONS, envFor(mock, { ALERT_DIGEST_EMAIL: 'new@example.invalid' }));
    expect(r.out).toMatch(/update\s+pawpi-digest .*addresses differ/);
    expect(r.out).not.toContain('example.invalid');
    const before = mock.writes().length;
    await run([...SECTIONS, '--apply'], envFor(mock, { ALERT_DIGEST_EMAIL: 'new@example.invalid' }));
    const put = mock.writes().slice(before).find((w) => w.path === '/api/v1/provisioning/contact-points/pawpi-digest');
    expect(put.method).toBe('PUT');
    expect(mock.state.contacts.find((c) => c.uid === 'pawpi-digest').settings.addresses).toBe('new@example.invalid');
  });

  it('leaves a pre-existing non-email pawpi-digest contact point alone', async () => {
    const mock = await startGrafana({ contacts: [...legacyContactsAugusto(), { uid: 'pawpi-digest', name: 'pawpi-digest', type: 'slack', settings: {} }] });
    const r = await run(SECTIONS, envFor(mock, { ALERT_DIGEST_EMAIL: EMAILS }));
    expect(r.out).toMatch(/skipped\s+pawpi-digest .*type "slack"/);
  });
});

describe('mergePolicyTree (pure)', () => {
  it('is idempotent and never drops a foreign route', () => {
    const first = mergePolicyTree(legacyTree());
    expect(first.changes.map((c) => c.action)).toEqual(['create', 'create']);
    const second = mergePolicyTree(first.tree);
    expect(second.changes.map((c) => c.action)).toEqual(['unchanged', 'unchanged']);
    expect(second.tree).toEqual(first.tree);
    expect(first.tree.routes.slice(2)).toEqual(legacyTree().routes);
    expect(Object.keys(POLICY_ROUTES)).toEqual(['p1', 'p2']);
  });

  it('matches routes by identity across matcher syntaxes', () => {
    expect(routeIdentity({ object_matchers: [['a', '=', '1'], ['b', '=~', 'x|y']] })).toBe(routeIdentity({ matchers: ['b=~"x|y"', 'a=1'] }));
    expect(routeIdentity({ object_matchers: [['severity', '=', 'P1']] })).not.toBe(routeIdentity({ object_matchers: [['severity', '=', 'P2']] }));
  });

  it('the safety invariant throws if a foreign route would be lost, reordered or altered', () => {
    const before = legacyTree();
    const own = new Set(Object.values(POLICY_ROUTES).map(routeIdentity));
    const dropped = { ...before, routes: before.routes.slice(1) };
    expect(() => assertPolicyPreserved(before, dropped, own)).toThrow(/would change an existing notification route/);
    const reordered = { ...before, routes: [...before.routes].reverse() };
    expect(() => assertPolicyPreserved(before, reordered, own)).toThrow(ApplyError);
    const altered = { ...before, routes: [{ ...before.routes[0], receiver: 'other' }, before.routes[1]] };
    expect(() => assertPolicyPreserved(before, altered, own)).toThrow(ApplyError);
    const rootChanged = { ...before, receiver: 'x' };
    expect(() => assertPolicyPreserved(before, rootChanged, own)).toThrow(/root notification policy/);
  });
});

describe('safety rails', () => {
  it('the HTTP guard refuses non-pawpi rule/contact paths and DELETE, even when asked directly', async () => {
    const mock = await startGrafana();
    const h = createHttp({ baseUrl: mock.url, token: TOKEN, allowWrite: [...ALERT_WRITE_ALLOW, ...POLICY_WRITE_ALLOW] });
    expect(() => h.put('/api/v1/provisioning/alert-rules/abc123legacy', {})).toThrow(/allow-list/);
    expect(() => h.put('/api/v1/provisioning/contact-points/aug-email', {})).toThrow(/allow-list/);
    expect(() => h.post('/api/dashboards/db', {})).toThrow(/allow-list/);
    expect(() => h.request('DELETE', '/api/v1/provisioning/alert-rules/pawpi-x')).toThrow(/DELETE is never allowed/);
    expect(mock.state.requests).toEqual([]);
  });

  it('helpers: subsetEqual tolerates server-added fields and omitted defaults; sameMap is exact; usage datasource picker', () => {
    expect(subsetEqual({ a: 1, b: [1, { c: false }] }, { a: 1, b: [1, {}], extra: 'x' })).toBe(true);
    expect(subsetEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(subsetEqual({ b: [1, 2] }, { b: [1] })).toBe(false);
    expect(subsetEqual({ a: false }, {})).toBe(true);
    expect(subsetEqual({ a: true }, {})).toBe(false);
    expect(sameMap({ a: '1' }, { a: '1' })).toBe(true);
    expect(sameMap({ a: '1' }, { a: '1', b: '2' })).toBe(false);
    expect(pickUsageDatasource(DATASOURCES).uid).toBe('ds-prom-usage');
    expect(pickUsageDatasource(DATASOURCES.filter((d) => d.uid !== 'ds-prom-usage'))).toBeNull();
    expect(PLACEHOLDERS.usage).toBe('${DS_USAGE}');
    expect(alertsSection.name).toBe('alerts');
  });

  it('the script source never issues a DELETE', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/observability/apply-grafana.mjs'), 'utf8');
    expect(src).not.toMatch(/\.request\(\s*['"]DELETE|method:\s*['"]DELETE|\.delete\(|check\/delete|\.del\(/);
  });
});

function legacyContactsAugusto() {
  return JSON.parse(JSON.stringify(LEGACY_CONTACTS.filter((c) => c.name === 'Augusto')));
}
