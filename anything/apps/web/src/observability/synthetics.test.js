// @vitest-environment node
// Step D synthetics: lint of observability/grafana/synthetics/*.json + the synthetics section of apply-grafana.mjs against a
// LOCAL mock Synthetic Monitoring API. No network.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXIT,
  SM_WRITE_ALLOW,
  createHttp,
  diffCheck,
  loadChecks,
  main,
  pickProbes,
} from '../../../../../scripts/observability/apply-grafana.mjs';
import { EXPECTED_CHECKS, FREE_TIER_EXECUTIONS, lintCheck, lintChecks, monthlyExecutions } from './syntheticsLint.js';
import { closeMocks, startSm } from './mockGrafana.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const DIR = path.join(REPO_ROOT, 'observability/grafana/synthetics');
const SM_TOKEN = 'sm_TOKEN_abcdef';
afterEach(closeMocks);

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const entries = files.map((file) => ({ file, check: JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')) }));
const byName = (n) => entries.find((e) => e.file === `${n}.json`).check;
const re = (check, which = 'failIfBodyNotMatchesRegexp') => (check.settings.http[which] ?? []).map((r) => new RegExp(r));

describe('synthetic check definitions (real files)', () => {
  it('ship exactly the five expected checks and pass the lint', () => {
    expect(files).toEqual(EXPECTED_CHECKS.map((n) => `${n}.json`).sort());
    expect(lintChecks(entries)).toEqual([]);
  });

  it('every 5 minutes, from 2-3 regions, GET only, and under the free-tier execution budget', () => {
    for (const { check } of entries) {
      expect(check.frequency).toBe(300000);
      expect(check.settings.http.method).toBe('GET');
    }
    const total = entries.reduce((n, e) => n + monthlyExecutions(e.check), 0);
    expect(total).toBeLessThan(FREE_TIER_EXECUTIONS);
  });

  it('the body expectations match what the real endpoints return', () => {
    const health = byName('health-deep');
    expect(re(health).every((r) => r.test('{"ok":true,"db_ms":4,"version":"abc1234"}'))).toBe(true);
    expect(re(health).some((r) => r.test('{"ok":false,"db_ms":4}'))).toBe(false);
    const social = byName('auth-social-enabled');
    expect(re(social).every((r) => r.test('{"google":true,"apple":true}'))).toBe(true);
    expect(re(social).every((r) => r.test('{"google":true,"apple":false}'))).toBe(false);
    expect(re(social).every((r) => r.test('{"google":false,"apple":true}'))).toBe(false);
    const providers = byName('auth-providers');
    const body = '{"google":{"id":"google","type":"oidc"},"apple-native":{"id":"apple-native","type":"credentials"}}';
    expect(re(providers).every((r) => r.test(body))).toBe(true);
    expect(re(providers).every((r) => r.test('{"google":{"id":"google"}}'))).toBe(false);
  });

  it('the account pages are client-rendered: the checks use the route id that IS in the SSR HTML, and refuse "Coming soon"', () => {
    for (const page of ['signin', 'signup']) {
      const check = byName(`account-${page}`);
      expect(check.target).toBe(`https://www.pawpi.info/account/${page}`);
      // the route module the check looks for is a real page file of this repo
      expect(fs.existsSync(path.join(REPO_ROOT, `anything/apps/web/src/app/account/${page}/page.jsx`))).toBe(true);
      const ssr = `<html>...window.__reactRouterRouteModules = {"root":route0,"account/${page}/page":route1};...</html>`;
      expect(re(check).every((r) => r.test(ssr))).toBe(true);
      // the SPA catch-all for an unknown page (HTTP 200!) must NOT satisfy the check
      expect(re(check).every((r) => r.test('<html>"routes":{"account/signin","account/signup"}</html>'))).toBe(false);
      expect(re(check, 'failIfBodyMatchesRegexp').some((r) => r.test(`<html>Coming soon</html>`))).toBe(true);
    }
  });

  it('negative fixtures: the lint names every offender', () => {
    const good = byName('health-deep');
    const bad = (patch) => lintCheck({ file: 'health-deep.json', check: { ...good, ...patch } });
    expect(bad({ job: 'health-deep' }).join()).toMatch(/job "health-deep" must equal "pawpi-health-deep"/);
    expect(bad({ target: 'http://www.pawpi.info/api/health/deep' }).join()).toMatch(/target must be an https/);
    expect(bad({ target: 'https://evil.example/x' }).join()).toMatch(/target must be an https/);
    expect(bad({ frequency: 60000 }).join()).toMatch(/frequency must be 300000/);
    expect(bad({ timeout: 60000 }).join()).toMatch(/timeout must be/);
    expect(bad({ probeRegions: ['EMEA'] }).join()).toMatch(/probeRegions must be 2-3/);
    expect(bad({ probeRegions: ['EMEA', 'MARS'] }).join()).toMatch(/probeRegions must be 2-3/);
    expect(bad({ alertSensitivity: 'high' }).join()).toMatch(/alertSensitivity/);
    expect(bad({ labels: [] }).join()).toMatch(/labels must include/);
    const http = (patch) => bad({ settings: { http: { ...good.settings.http, ...patch } } }).join();
    expect(http({ method: 'POST' })).toMatch(/method must be GET/);
    expect(http({ body: '{"email":"x"}' })).toMatch(/settings\.http\.body is not allowed/);
    expect(http({ headers: [{ name: 'Authorization', value: 'x' }] })).toMatch(/settings\.http\.headers is not allowed/);
    expect(http({ validStatusCodes: [200, 500] })).toMatch(/validStatusCodes/);
    expect(http({ failIfBodyNotMatchesRegexp: [] })).toMatch(/must name what the body must contain/);
    expect(http({ failIfBodyNotMatchesRegexp: ['(?=ok)'] })).toMatch(/RE2/);
    expect(http({ failIfBodyNotMatchesRegexp: ['('] })).toMatch(/does not compile/);
    const noComing = lintCheck({ file: 'account-signin.json', check: { ...byName('account-signin'), settings: { http: { ...byName('account-signin').settings.http, failIfBodyMatchesRegexp: [] } } } });
    expect(noComing.join()).toMatch(/Coming soon/);
    expect(lintChecks([entries[0], entries[0]]).join()).toMatch(/duplicate job/);
    const many = Array.from({ length: 12 }, (_, i) => ({ file: `x${i}.json`, check: { ...good, job: `pawpi-x${i}`, probeRegions: ['EMEA', 'AMER', 'APAC'] } }));
    expect(lintChecks(many).join()).toMatch(/free tier/);
  });
});

describe('apply-grafana synthetics section', () => {
  const run = async (args, env = {}) => {
    const out = [];
    const err = [];
    const code = await main({ argv: args, env, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  const envFor = (mock) => ({ GRAFANA_SM_URL: mock.url, GRAFANA_SM_TOKEN: SM_TOKEN });
  const S = ['--sections', 'synthetics'];

  it('is a clear NO-OP without GRAFANA_SM_URL + GRAFANA_SM_TOKEN, even with --apply, and needs no Grafana env', async () => {
    const r = await run(S);
    expect(r.code).toBe(EXIT.OK);
    expect(r.out).toMatch(/synthetics section is a no-op/);
    expect(r.out).toMatch(/NO-OP: set GRAFANA_SM_URL and GRAFANA_SM_TOKEN/);
    const half = await run([...S, '--apply'], { GRAFANA_SM_URL: 'http://127.0.0.1:1' });
    expect(half.code).toBe(EXIT.OK);
    expect(half.out).toMatch(/nothing to write/);
  });

  it('dry run plans five creates and writes nothing; --apply adds each check once with resolved probes; second run unchanged', async () => {
    const mock = await startSm();
    const dry = await run(S, envFor(mock));
    expect(dry.code).toBe(EXIT.OK);
    expect(dry.out).toContain('Plan: 5 create, 0 update, 0 unchanged');
    expect(mock.writes()).toEqual([]);

    const applied = await run([...S, '--apply'], envFor(mock));
    expect(applied.code).toBe(EXIT.OK);
    const adds = mock.writes();
    expect(adds).toHaveLength(5);
    for (const w of adds) {
      expect(w.path).toBe('/api/v1/check/add');
      expect(w.body.job.startsWith('pawpi-')).toBe(true);
      expect('probeRegions' in w.body).toBe(false);
      expect(w.body.probes).toEqual([12, 22]); // first online PUBLIC probe by name in EMEA (Amsterdam) and AMER (Atlanta)
      expect(w.body.frequency).toBe(300000);
      expect(w.auth).toBe(`Bearer ${SM_TOKEN}`);
    }
    expect(applied.out + applied.err).not.toContain(SM_TOKEN);

    const again = await run(S, envFor(mock));
    expect(again.out).toContain('Plan: 0 create, 0 update, 5 unchanged');
    const before = mock.writes().length;
    expect((await run([...S, '--apply'], envFor(mock))).code).toBe(EXIT.OK);
    expect(mock.writes().length).toBe(before);
  });

  it('updates a drifted pawpi- check via check/update (keeping id, tenantId and the live probes); never touches other checks; never deletes', async () => {
    const mock = await startSm({ checks: [{ id: 1, tenantId: 7, job: 'someone-elses', target: 'https://example.invalid', frequency: 60000, probes: [1] }] });
    await run([...S, '--apply'], envFor(mock));
    const live = [...mock.state.checks.values()].find((c) => c.job === 'pawpi-health-deep');
    live.timeout = 3000;
    live.probes = [31];
    const dry = await run(S, envFor(mock));
    expect(dry.out).toMatch(/update\s+pawpi-health-deep .*timeout differs/);
    const before = mock.writes().length;
    await run([...S, '--apply'], envFor(mock));
    const w = mock.writes().slice(before);
    expect(w).toHaveLength(1);
    expect(w[0].path).toBe('/api/v1/check/update');
    expect(w[0].body).toMatchObject({ id: live.id, tenantId: 7, timeout: 10000, probes: [31] });
    expect(mock.state.checks.get(1).job).toBe('someone-elses');
    expect(mock.state.requests.some((q) => q.method === 'DELETE')).toBe(false);
    expect((await run(S, envFor(mock))).out).toContain('0 update');
  });

  it('exits 3 when a region has no online public probe, and on a rejected token', async () => {
    const noAmer = await startSm({ probes: [{ id: 1, name: 'Frankfurt', region: 'EMEA', public: true, online: true }] });
    const r = await run([...S, '--apply'], envFor(noAmer));
    expect(r.code).toBe(EXIT.GRAFANA);
    expect(r.err).toMatch(/no online public Synthetic Monitoring probe in region "AMER"/);
    expect(noAmer.writes()).toEqual([]);
    const bad = await startSm({ token: 'other' });
    const b = await run(S, envFor(bad));
    expect(b.code).toBe(EXIT.GRAFANA);
    expect(b.err).toMatch(/HTTP 401/);
    expect(b.err + b.out).not.toContain(SM_TOKEN);
  });

  it('the SM http client only writes check add/update and refuses DELETE', async () => {
    const mock = await startSm();
    const h = createHttp({ baseUrl: mock.url, token: SM_TOKEN, allowWrite: SM_WRITE_ALLOW, urlEnv: 'GRAFANA_SM_URL' });
    expect(() => h.post('/api/v1/check/delete/1', {})).toThrow(/allow-list/);
    expect(() => h.request('DELETE', '/api/v1/check/delete/1')).toThrow(/DELETE is never allowed/);
    expect(() => h.post('/api/v1/probe/add', {})).toThrow(/allow-list/);
    expect(mock.state.requests).toEqual([]);
    expect(() => createHttp({ baseUrl: 'nope', token: 'x', urlEnv: 'GRAFANA_SM_URL' })).toThrow(/GRAFANA_SM_URL is not a valid URL/);
  });

  it('refuses invalid definitions (exit 1): foreign job names, missing regions', async () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'pawpi-sm-'));
    fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ job: 'not-pawpi', target: 'http://x', frequency: 1, settings: {} }));
    const r = await run([...S, '--synthetics-dir', dir]);
    expect(r.code).toBe(EXIT.USAGE);
    expect(r.err).toMatch(/job "not-pawpi" must equal "pawpi-x"/);
    expect(r.err).toMatch(/probeRegions/);
    expect(() => loadChecks(dir)).toThrow();
  });

  it('pickProbes + diffCheck helpers', () => {
    expect(pickProbes([{ id: 2, name: 'B', region: 'EMEA' }, { id: 1, name: 'A', region: 'EMEA' }], ['emea'])).toEqual([1]);
    expect(diffCheck({ target: 'a', frequency: 1, enabled: true, labels: [{ name: 'b', value: '1' }, { name: 'a', value: '2' }], settings: { http: { noFollowRedirects: false } } },
      { target: 'a', frequency: 1, enabled: true, labels: [{ name: 'a', value: '2' }, { name: 'b', value: '1' }], settings: { http: {} } })).toEqual([]);
  });
});
