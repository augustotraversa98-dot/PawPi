// @vitest-environment node
// "Nothing is unmonitored" guard (night-run Step E), single CI entry point. No network.
//   (a) every route file under src/app/api maps to an area (or is allow-listed with a reason)
//   (b) every mobile screen file has an entry in BOTH registries
//   (c) every funnel step is emitted by mobile code
//   (d) dashboards + alerts reference only contract names (+ pawpi-web log fields exist)
// The first describe runs the guard over the REAL repo; the rest PROVE it bites, using temp-dir fixtures and in-memory input:
// a new route / screen / unemitted funnel step / dashboard or alert with an unknown metric makes it fail with the offender named.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_OTHER_API_DIRS,
  apiPathForRouteFile,
  findFunnelCalls,
  formatFailures,
  isApiRouteFile,
  isScreenFile,
  lokiJsonFields,
  parseContractFunnels,
  runCoverageGuard,
  screenForFile,
} from './coverageGuard.js';
import { loadGuardInput, readRegistry } from './coverageGuardFs.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../..');

// ---------------------------------------------------------------- the real repo
describe('coverage guard over the real repo', () => {
  const real = loadGuardInput(REPO);
  const failures = formatFailures(runCoverageGuard(real));

  it('(a) every API route file maps to an area (or is allow-listed with a reason)', () => {
    expect(real.apiRouteFiles.filter(isApiRouteFile).length).toBeGreaterThan(100);
    expect(failures.filter((f) => f.startsWith('(a)'))).toEqual([]);
  });

  it('(b) every mobile screen file has an entry in BOTH registries', () => {
    expect(real.mobileFiles.filter(isScreenFile).length).toBeGreaterThan(50);
    expect(real.mobileRegistry).not.toBeNull();
    expect(failures.filter((f) => f.startsWith('(b)'))).toEqual([]);
  });

  it('(c) every funnel step in the contract and the registries is emitted in mobile code', () => {
    expect(Object.keys(parseContractFunnels(real.contractMarkdown)).length).toBe(4);
    expect(real.mobileSources.length).toBeGreaterThan(100);
    expect(failures.filter((f) => f.startsWith('(c)'))).toEqual([]);
  });

  it('(d) dashboards and alerts reference only contract names', () => {
    expect(real.dashboards).toHaveLength(11);
    expect(real.alerts).toHaveLength(2);
    expect(failures.filter((f) => f.startsWith('(d)'))).toEqual([]);
  });

  it('the guard as a whole passes (a failure line names the offender and the fix)', () => {
    expect(failures).toEqual([]);
  });

  it('the allow-list only names directories that exist, each with a reason', () => {
    const top = new Set(real.apiRouteFiles.map((f) => f.split('/')[0]));
    for (const [dir, reason] of Object.entries(ALLOWED_OTHER_API_DIRS)) {
      expect(top.has(dir), `stale allow-list entry ${dir}`).toBe(true);
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it('contract funnels are exactly the registry funnels in both apps', () => {
    const fromContract = parseContractFunnels(real.contractMarkdown);
    expect(fromContract).toEqual(real.webRegistry.FUNNELS);
    expect(fromContract).toEqual(real.mobileRegistry.FUNNELS);
  });
});

// ---------------------------------------------------------------- pure helpers
describe('guard helpers', () => {
  it('screenForFile / isScreenFile follow the documented rule', () => {
    expect(screenForFile('(tabs)/health.jsx')).toBe('/health');
    expect(screenForFile('(tabs)/index.jsx')).toBe('/');
    expect(screenForFile('service/[id].jsx')).toBe('/service/:id');
    expect(screenForFile('+not-found.tsx')).toBe('/+not-found');
    for (const f of ['_layout.jsx', '(tabs)/_layout.tsx', 'chat.test.jsx', 'AUTH_FLOW.md', '(tabs)/tabsConfig.js']) expect(isScreenFile(f), f).toBe(false);
    expect(isScreenFile('chat.jsx')).toBe(true);
  });

  it('route files: only route.js/route.ts count; paths keep [id] segments', () => {
    expect(isApiRouteFile('pets/[id]/route.js')).toBe(true);
    expect(isApiRouteFile('route.ts')).toBe(true);
    expect(isApiRouteFile('utils/sql.js')).toBe(false);
    expect(isApiRouteFile('pets/routes.js')).toBe(false);
    expect(apiPathForRouteFile('pets/[id]/follow/route.js')).toBe('/api/pets/[id]/follow');
    expect(apiPathForRouteFile('route.js')).toBe('/api');
  });

  it('findFunnelCalls sees literal calls, ignores comments and variables', () => {
    const src = [
      `trackFunnel("activation", 'first_post');`,
      `  // trackFunnel("routines", "routine_saved");`,
      `/** doc: trackFunnel("services", "booking_done") */`,
      `trackFunnel(funnel, step);`,
      `trackFunnel(\n  "health_logging",\n  "log_saved"\n);`,
    ].join('\n');
    expect(findFunnelCalls(src)).toEqual([
      { funnel: 'activation', step: 'first_post' },
      { funnel: 'health_logging', step: 'log_saved' },
    ]);
  });

  it('lokiJsonFields extracts what a query reads', () => {
    expect(lokiJsonFields('{job="pawpi-web"} | json level="level", msg="msg" | level="error"')).toEqual(['level', 'msg']);
    expect(lokiJsonFields('sum(count_over_time({job="pawpi-web"} | json route="route" | unwrap duration_ms [1m]))')).toEqual(['route', 'duration_ms']);
    expect(lokiJsonFields('{job="pawpi-web"}')).toEqual([]);
  });
});

// ---------------------------------------------------------------- negative proofs on fixtures
const roots = [];
afterAll(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function copy(root, rel) {
  write(root, rel, fs.readFileSync(path.join(REPO, rel), 'utf8'));
}

/** A tiny but GREEN repo: a few routes, a few screens, every funnel step emitted, a real dashboard + the real alerts. */
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawpi-guard-'));
  roots.push(root);
  copy(root, 'docs/observability/night-run/01-TELEMETRY-CONTRACT.md');
  copy(root, 'anything/apps/web/src/lib/telemetry/registry.js');
  copy(root, 'anything/apps/mobile/src/telemetry/registry.js');
  copy(root, 'observability/grafana/dashboards/overview.json');
  copy(root, 'observability/grafana/dashboards/database-infra.json');
  copy(root, 'observability/grafana/alerts/p1-critical.json');
  copy(root, 'observability/grafana/alerts/p2-digest.json');
  for (const f of ['pets/route.js', 'pets/[id]/profile/route.js', 'auth/[...nextauth]/route.js', 'upload/route.js', 'health/deep/route.js'])
    write(root, `anything/apps/web/src/app/api/${f}`, 'export async function GET() {}\n');
  write(root, 'anything/apps/web/src/app/api/utils/helper.js', 'export const x = 1;\n'); // not a route: ignored
  for (const f of ['index.jsx', '(tabs)/health.jsx', 'welcome.jsx', '_layout.jsx', 'welcome.test.jsx'])
    write(root, `anything/apps/mobile/src/app/${f}`, 'export default function S() { return null; }\n');
  const reg = readRegistry(path.join(root, 'anything/apps/web/src/lib/telemetry/registry.js'));
  const calls = Object.entries(reg.FUNNELS).flatMap(([f, steps]) => steps.map((s) => `trackFunnel("${f}", "${s}");`));
  write(root, 'anything/apps/mobile/src/components/funnels.js', calls.join('\n') + '\n');
  return root;
}
const check = (root) => formatFailures(runCoverageGuard(loadGuardInput(root)));

describe('negative proofs (temp-dir fixtures): the guard fails and names the offender', () => {
  it('baseline: the fixture is green (so every failure below is caused by the one change)', () => {
    expect(check(makeFixture())).toEqual([]);
  });

  it('(a) a NEW route directory with no area mapping fails, naming the route file', () => {
    const root = makeFixture();
    write(root, 'anything/apps/web/src/app/api/brand-new-feature/[id]/route.js', 'export async function GET() {}\n');
    const out = check(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('(a)');
    expect(out[0]).toContain('src/app/api/brand-new-feature/[id]/route.js');
    expect(out[0]).toContain('areas.js');
  });

  it('(a) a new route inside a MAPPED directory is fine; an allow-listed "other" dir is fine', () => {
    const root = makeFixture();
    write(root, 'anything/apps/web/src/app/api/pets/[id]/brand-new-sub/route.js', 'export async function GET() {}\n');
    write(root, 'anything/apps/web/src/app/api/__create/ssr-test/route.js', 'export async function GET() {}\n');
    expect(check(root)).toEqual([]);
  });

  it('(b) a NEW screen file missing from both registries fails twice (web + mobile), naming the file and screen', () => {
    const root = makeFixture();
    write(root, 'anything/apps/mobile/src/app/brand-new-screen.jsx', 'export default function S() { return null; }\n');
    write(root, 'anything/apps/mobile/src/app/(tabs)/deep/[id].jsx', 'export default function S() { return null; }\n');
    const out = check(root);
    expect(out.filter((l) => l.includes('mobile src/app/brand-new-screen.jsx'))).toHaveLength(2);
    expect(out.some((l) => l.includes('brand-new-screen.jsx') && l.includes('WEB registry'))).toBe(true);
    expect(out.some((l) => l.includes('brand-new-screen.jsx') && l.includes('MOBILE registry'))).toBe(true);
    expect(out.some((l) => l.includes('/deep/:id'))).toBe(true);
    expect(out.every((l) => l.startsWith('(b)'))).toBe(true);
  });

  it('(b) a screen added to the WEB registry only (mirror not copied) still fails, naming the mobile mirror', () => {
    const root = makeFixture();
    write(root, 'anything/apps/mobile/src/app/half-done.jsx', 'export default function S() { return null; }\n');
    const webReg = path.join(root, 'anything/apps/web/src/lib/telemetry/registry.js');
    fs.writeFileSync(webReg, fs.readFileSync(webReg, 'utf8').replace("export const SCREENS = [", "export const SCREENS = [\n  '/half-done',"));
    const out = check(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('half-done.jsx');
    expect(out[0]).toContain('MOBILE registry mirror');
  });

  it('(b) layouts, tests and the tabsConfig helper are not screens', () => {
    const root = makeFixture();
    write(root, 'anything/apps/mobile/src/app/(tabs)/_layout.tsx', 'x\n');
    write(root, 'anything/apps/mobile/src/app/new-thing.test.jsx', 'x\n');
    write(root, 'anything/apps/mobile/src/app/(tabs)/tabsConfig.js', 'x\n');
    expect(check(root)).toEqual([]);
  });

  it('(c) a funnel step that nothing emits fails, naming funnel/step', () => {
    const root = makeFixture();
    const f = path.join(root, 'anything/apps/mobile/src/components/funnels.js');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('trackFunnel("routines", "routine_saved");\n', ''));
    const out = check(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('(c) funnel step routines/routine_saved');
  });

  it('(c) a step only "emitted" in a test file or a comment does not count', () => {
    const root = makeFixture();
    const f = path.join(root, 'anything/apps/mobile/src/components/funnels.js');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('trackFunnel("services", "booking_done");', '// trackFunnel("services", "booking_done");'));
    write(root, 'anything/apps/mobile/src/components/x.test.js', 'trackFunnel("services", "booking_done");\n');
    const out = check(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('services/booking_done');
  });

  it('(c) a trackFunnel call naming an unknown step fails, naming the file', () => {
    const root = makeFixture();
    write(root, 'anything/apps/mobile/src/components/typo.js', 'trackFunnel("activation", "first_pots");\n');
    const out = check(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('mobile src/components/typo.js');
    expect(out[0]).toContain('first_pots');
  });

  it('(c) a funnel step added to the CONTRACT only fails (not in the registry, not emitted)', () => {
    const root = makeFixture();
    const c = path.join(root, 'docs/observability/night-run/01-TELEMETRY-CONTRACT.md');
    fs.writeFileSync(c, fs.readFileSync(c, 'utf8').replace('routine_form_open, routine_saved', 'routine_form_open, routine_saved, routine_shared'));
    const out = check(root);
    expect(out.some((l) => l.includes('routines/routine_shared') && l.includes('no trackFunnel'))).toBe(true);
    expect(out.some((l) => l.includes('routines/routine_shared') && l.includes('not in the web registry'))).toBe(true);
  });

  it('(d) a dashboard charting a metric that is not in the contract fails, naming file, panel and metric', () => {
    const root = makeFixture();
    const f = path.join(root, 'observability/grafana/dashboards/overview.json');
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const panel = d.panels.find((p) => p.type !== 'row' && p.targets?.some((t) => /pawpi_http_requests_total/.test(t.expr ?? '')));
    panel.targets.find((t) => /pawpi_http_requests_total/.test(t.expr ?? '')).expr = 'sum(rate(pawpi_made_up_total[5m]))';
    fs.writeFileSync(f, JSON.stringify(d));
    const out = check(root);
    const hit = out.filter((l) => l.includes('pawpi_made_up_total'));
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0]).toContain('(d)');
    expect(hit[0]).toContain('overview.json');
    expect(hit[0]).toContain(panel.title);
  });

  it('(d) an alert rule using a metric outside the contract fails, naming the rule file', () => {
    const root = makeFixture();
    const f = path.join(root, 'observability/grafana/alerts/p1-critical.json');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('pawpi_db_errors_total', 'pawpi_invented_errors_total'));
    const out = check(root);
    const hit = out.filter((l) => l.includes('pawpi_invented_errors_total'));
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0]).toContain('p1-critical.json');
  });

  it('(d) a pawpi-web panel reading a log field that the server does not write fails, naming the panel and field', () => {
    const root = makeFixture();
    const f = path.join(root, 'observability/grafana/dashboards/database-infra.json');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('json level=\\"level\\", msg=\\"msg\\"', 'json level=\\"level\\", msg=\\"message\\"'));
    const out = check(root);
    const hit = out.filter((l) => l.includes('"message"'));
    expect(hit).toHaveLength(1);
    expect(hit[0]).toContain('database-infra.json');
    expect(hit[0]).toContain('Server error logs');
  });
});

describe('guard core is pure (in-memory input, no disk)', () => {
  const real = loadGuardInput(REPO);
  const base = { ...real, apiRouteFiles: [], mobileFiles: [], mobileSources: [], dashboards: [], alerts: [] };

  it('empty listings produce only the unavoidable funnel failures (nothing emits them)', () => {
    const out = runCoverageGuard(base);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((f) => f.check === 'c')).toBe(true);
  });

  it('a stub areaForPath can flag or accept a route without touching the real map', () => {
    const files = { ...base, mobileSources: real.mobileSources, apiRouteFiles: ['zzz/route.js'] };
    expect(runCoverageGuard({ ...files, areaForPath: () => 'other' }).map((f) => f.check)).toEqual(['a']);
    expect(runCoverageGuard({ ...files, areaForPath: () => 'pets' })).toEqual([]);
    expect(runCoverageGuard({ ...files, areaForPath: () => 'other', allowOtherApiDirs: { zzz: 'because' } })).toEqual([]);
  });

  it('a missing mobile registry is reported once per screen instead of crashing', () => {
    const out = runCoverageGuard({ ...base, mobileSources: real.mobileSources, mobileFiles: ['welcome.jsx'], mobileRegistry: null });
    expect(formatFailures(out).join('\n')).toContain('mobile registry');
  });
});
