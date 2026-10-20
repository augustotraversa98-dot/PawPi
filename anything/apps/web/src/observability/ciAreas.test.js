// @vitest-environment node
// Path-aware CI (scripts/ci/changed-areas.mjs + .github/workflows/ci.yml): the area mapping, the fail-safe behaviour and the
// "honesty test" that checks the mapping against the real repo tree, so a new code folder (or a new cross-folder test
// dependency) cannot silently fall outside every filter. No network.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, MAX_FILES, RULES, classify, decide, listPullRequestFiles, main } from '../../../../../scripts/ci/changed-areas.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const CI = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

const runs = (files) => Object.fromEntries(AREAS.map((a) => [a, decide(files, a).run]));
const ALL_TRUE = { mobile: true, web: true, integration: true };

describe('mapping: which jobs a change needs (examples from the PR description)', () => {
  it('docs-only, QA reports, brand kit, root markdown, implementation notes: no job runs', () => {
    for (const f of ['docs/qa/runs/2026-10-17_fix-log.md', 'docs/roadmap.md', 'anything/AUDIT_REPORT.md', 'anything/apps/ROUTINES_VISUAL_GUIDE.md', 'README.md', 'CLAUDE.md', 'pawpi-brand-kit/logo/pawpi-app-icon.svg', 'demo-assets/mango.jpg', '.gitignore', '.gitleaks.toml', '.claude/workflows/build-batch.js']) {
      expect(runs([f]), f).toEqual({ mobile: false, web: false, integration: false });
    }
  });

  it('docs that web unit tests read (observability, cron runbook) run ONLY the web unit job: no jest, no Postgres', () => {
    for (const f of ['docs/observability/OPERATIONS.md', 'docs/observability/night-run/01-TELEMETRY-CONTRACT.md', 'docs/ops/railway-cron.md', 'observability/grafana/alerts/p1-critical.json', 'scripts/observability/apply-grafana.mjs', 'scripts/cron/cron-trigger.mjs']) {
      expect(runs([f]), f).toEqual({ mobile: false, web: true, integration: false });
    }
  });

  it('mobile-only: jest + web unit (the coverage guard reads mobile src); config/assets/lockfile: jest only; never the Postgres job', () => {
    expect(runs(['anything/apps/mobile/src/app/index.jsx'])).toEqual({ mobile: true, web: true, integration: false });
    expect(runs(['anything/apps/mobile/src/telemetry/registry.js'])).toEqual({ mobile: true, web: true, integration: false });
    for (const f of ['anything/apps/mobile/package-lock.json', 'anything/apps/mobile/app.json', 'anything/apps/mobile/assets/images/icon.png']) {
      expect(runs([f]), f).toEqual({ mobile: true, web: false, integration: false });
    }
  });

  it('web-only (incl. its lockfile) and migrations: web unit + Postgres, never jest', () => {
    for (const f of ['anything/apps/web/src/app/api/pets/route.js', 'anything/apps/web/bun.lock', 'anything/apps/web/package.json', 'supabase/migrations/0133_username_backfill.sql', 'supabase/verify_0133.sql']) {
      expect(runs([f]), f).toEqual({ mobile: false, web: true, integration: true });
    }
  });

  it('workflow, filter, root lockfile / toolchain pin => EVERYTHING', () => {
    for (const f of ['.github/workflows/ci.yml', '.github/workflows/gitleaks.yml', '.github/actions/x/action.yml', 'scripts/ci/changed-areas.mjs', 'package.json', 'package-lock.json', 'bun.lockb', '.nvmrc']) {
      expect(runs([f]), f).toEqual(ALL_TRUE);
    }
  });

  it('a mixed PR runs the union; one needed file is enough', () => {
    expect(runs(['docs/roadmap.md', 'anything/apps/web/src/lib/x.js'])).toEqual({ mobile: false, web: true, integration: true });
    expect(runs(['anything/apps/mobile/app.json', 'anything/apps/web/src/lib/x.js'])).toEqual(ALL_TRUE);
    expect(runs(['docs/a.md', 'docs/b.md', 'README.md'])).toEqual({ mobile: false, web: false, integration: false });
  });

  it('renames count with both paths', async () => {
    const calls = [];
    const fetchImpl = async (url) => { calls.push(url); return Response.json([{ filename: 'docs/new.md', previous_filename: 'anything/apps/web/src/old.js' }]); };
    const files = await listPullRequestFiles({ repo: 'o/r', number: 5, token: 't', fetchImpl });
    expect(files).toEqual(['docs/new.md', 'anything/apps/web/src/old.js']);
    expect(runs(files)).toEqual({ mobile: false, web: true, integration: true });
    expect(calls[0]).toContain('/repos/o/r/pulls/5/files?per_page=100&page=1');
  });
});

describe('fail safe: when unsure, run everything', () => {
  it('unmapped path, empty list, no list, a huge PR, an unknown area', () => {
    expect(runs(['newfolder/src/thing.js'])).toEqual(ALL_TRUE);
    expect(runs(['docs/a.md', 'newfolder/src/thing.js'])).toEqual(ALL_TRUE);
    expect(runs([])).toEqual(ALL_TRUE);
    expect(runs(undefined)).toEqual(ALL_TRUE);
    expect(runs(Array.from({ length: MAX_FILES }, (_, i) => `docs/f${i}.md`))).toEqual(ALL_TRUE);
    expect(decide(['docs/a.md'], 'nope').run).toBe(true);
    expect(decide(['docs/a.md'], undefined).run).toBe(true);
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'areas-'));
  const env = (over = {}) => {
    const event = path.join(tmp, `event-${Math.random()}.json`);
    const out = path.join(tmp, `out-${Math.random()}`);
    fs.writeFileSync(event, JSON.stringify({ pull_request: { number: 7 } }));
    fs.writeFileSync(out, '');
    return { env: { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't', GITHUB_OUTPUT: out, ...over }, out };
  };
  const kv = (file) => Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const filesBody = (...names) => async () => Response.json(names.map((filename) => ({ filename })));

  it('push to main / any non-PR event runs everything without calling GitHub', async () => {
    for (const name of ['push', 'workflow_dispatch', undefined]) {
      const { env: e, out } = env({ GITHUB_EVENT_NAME: name });
      const r = await main(['--area', 'integration'], e, async () => { throw new Error('must not be called'); });
      expect(r.run, String(name)).toBe(true);
      expect(kv(out).run).toBe('true');
    }
  });

  it('API errors, bad bodies and missing event data all end in run=true', async () => {
    const bad = [
      async () => new Response('nope', { status: 403 }),
      async () => { throw new Error('network down'); },
      async () => Response.json({ message: 'not an array' }),
    ];
    for (const f of bad) {
      const { env: e, out } = env();
      expect((await main(['--area', 'mobile'], e, f)).run).toBe(true);
      expect(kv(out).run).toBe('true');
      expect(kv(out).reason).toMatch(/fail safe/);
    }
    const { env: e2 } = env({ GITHUB_EVENT_PATH: path.join(tmp, 'missing.json') });
    expect((await main(['--area', 'mobile'], e2, filesBody('docs/a.md'))).run).toBe(true);
    expect((await main([], env().env, filesBody('docs/a.md'))).run).toBe(true); // no --area
  });

  it('a docs-only PR: all three areas skip, with a readable reason and no shell-significant newlines', async () => {
    for (const area of AREAS) {
      const { env: e, out } = env();
      const r = await main(['--area', area], e, filesBody('docs/a.md', 'docs/qa/b.md'));
      expect(r.run, area).toBe(false);
      expect(kv(out)).toMatchObject({ run: 'false' });
      expect(kv(out).reason).toMatch(/none of the 2 changed files needs/);
    }
    const { env: e, out } = env();
    await main(['--area', 'web'], e, filesBody('anything/apps/web/src/a\nrun=false.js'));
    expect(Object.keys(kv(out)).sort()).toEqual(['reason', 'run']); // a hostile file name cannot inject a second output line
    expect(kv(out).run).toBe('true');
  });

  it('paginates: a full page asks for the next one', async () => {
    const pages = [];
    const fetchImpl = async (url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      pages.push(page);
      return Response.json(page === 1 ? Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md` })) : [{ filename: 'docs/last.md' }]);
    };
    const files = await listPullRequestFiles({ repo: 'o/r', number: 1, token: 't', fetchImpl });
    expect(pages).toEqual([1, 2]);
    expect(files).toHaveLength(101);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// THE HONESTY TESTS: the mapping against the real repository
// ---------------------------------------------------------------------------------------------------------------------------
function trackedFiles() {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && r.stdout) return r.stdout.split('\0').filter(Boolean);
  // no git (e.g. a source tarball): walk the tree instead
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      if (['.git', 'node_modules', 'Pods'].includes(e.name)) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel); else out.push(rel);
    }
  };
  walk('');
  return out;
}

describe('honesty test: every file in the repo is covered by a rule', () => {
  const files = trackedFiles();

  it('the repo tree was read', () => expect(files.length).toBeGreaterThan(500));

  it('NO tracked file is unmapped (a new code folder must get a rule in scripts/ci/changed-areas.mjs, or an explicit ignore)', () => {
    const unmapped = files.filter((f) => classify(f).areas === null);
    const byFolder = [...new Set(unmapped.map((f) => f.split('/').slice(0, 3).join('/')))].slice(0, 15);
    expect(unmapped.slice(0, 10), `unmapped paths (add a rule in scripts/ci/changed-areas.mjs; folders: ${byFolder.join(', ')})`).toEqual([]);
  });

  it('negative control: an unmapped code folder IS detected, and CI runs everything for it', () => {
    for (const f of ['brand-new-app/src/index.js', 'packages/shared/index.ts', 'anything/apps/desktop/main.js', 'anything/shared/util.js', 'tools/x.mjs', 'docs-site/package.json']) {
      expect(classify(f).areas, f).toBeNull();
      expect(runs([f]), f).toEqual(ALL_TRUE);
    }
  });

  it('every top-level folder and every anything/apps/* folder has an explicit rule', () => {
    const dirs = new Set();
    for (const f of files) {
      const parts = f.split('/');
      if (parts.length > 1 && parts[0] !== 'anything') dirs.add(parts[0]);
      // `anything/` is only a container: its sub-folders (docs, apps/web, apps/mobile, apps/<new>) are what need rules
      if (parts[0] === 'anything' && parts[1] !== 'apps' && parts.length > 2) dirs.add(`anything/${parts[1]}`);
      if (parts[0] === 'anything' && parts[1] === 'apps' && parts.length > 3) dirs.add(`anything/apps/${parts[2]}`);
    }
    for (const d of dirs) {
      expect(classify(`${d}/some/file.js`).areas, `${d}/ has no rule`).not.toBeNull();
    }
  });

  it('every rule matches at least one tracked file (no dead rules after a folder is renamed)', () => {
    const dead = RULES.filter((r) => !files.some((f) => r.re.test(f)) && !/^\^\\\.github|scripts\\\/ci|package|nvmrc|\\\.claude/.test(r.re.source));
    expect(dead.map((r) => r.re.source)).toEqual([]);
  });
});

describe('honesty test: cross-folder test dependencies are covered by the filter', () => {
  // A web or mobile test that reads a repo file outside its own app must be covered by that app's job, otherwise a change to that
  // file would skip the test that guards it. Scan the test sources for repo-root-relative path literals.
  const files = trackedFiles();
  const testFiles = files.filter((f) => /^anything\/apps\/(web|mobile)\//.test(f) && /\.(test|spec)\.[cm]?[jt]sx?$|\/(test|__tests__)\//.test(f) && /\.[cm]?[jt]sx?$/.test(f));
  const LITERAL = /['"`]((?:scripts|observability|docs|supabase|\.github|pawpi-brand-kit|demo-assets|anything\/docs|anything\/apps\/(?:mobile|web)|[A-Z][A-Za-z_]+\.md)\/?[\w./\-[\]]*)['"`]/g;

  const needs = (app) => {
    const bad = [];
    for (const tf of testFiles.filter((f) => f.startsWith(`anything/apps/${app}/`))) {
      const src = fs.readFileSync(path.join(REPO_ROOT, tf), 'utf8');
      for (const m of src.matchAll(LITERAL)) {
        const lit = m[1];
        if (!lit.includes('/') && !/\.\w+$/.test(lit)) continue;
        if (lit.startsWith(`anything/apps/${app}`)) continue; // its own app
        if (/^[A-Z_]+$/.test(lit)) continue;
        const candidates = lit.endsWith('/') ? [`${lit}x`] : [lit, `${lit}/x`];
        const ok = candidates.some((c) => {
          const a = classify(c).areas;
          return a === null || (Array.isArray(a) && a.includes(app));
        });
        // 'ignore' / other-app-only => a change there would NOT run this app's tests although a test reads it
        if (!ok) bad.push(`${tf} reads ${lit}`);
      }
    }
    return [...new Set(bad)];
  };

  it('every repo path a WEB test reads from outside anything/apps/web triggers the web unit job', () => {
    expect(needs('web')).toEqual([]);
  });

  it('every repo path a MOBILE test reads from outside anything/apps/mobile triggers the mobile job', () => {
    expect(needs('mobile')).toEqual([]);
  });

  it('negative control: the scan would catch a test that reads a docs file or an ignored folder', () => {
    expect(classify('docs/roadmap.md').areas).toBe('ignore');
    expect(classify('pawpi-brand-kit/BRAND-GUIDELINES.md').areas).toBe('ignore');
    expect(Array.isArray(classify('docs/ops/railway-cron.md').areas) && classify('docs/ops/railway-cron.md').areas.includes('web')).toBe(true);
  });
});

describe('workflow wiring (.github/workflows/ci.yml)', () => {
  const lines = CI.split('\n');
  const jobBlock = (id) => {
    const start = lines.findIndex((l) => l === `  ${id}:`);
    let end = lines.findIndex((l, i) => i > start && /^ {2}[a-z][\w-]*:\s*$/.test(l));
    if (end < 0) end = lines.length;
    return lines.slice(start, end).join('\n');
  };
  const NAMES = { mobile: 'mobile (jest)', web: 'web (vitest)', 'web-integration': 'web (integration / real Postgres)' };
  const AREA = { mobile: 'mobile', web: 'web', 'web-integration': 'integration' };

  it('keeps the three required check names EXACTLY and nothing else', () => {
    const names = [...CI.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(Object.values(NAMES).sort());
  });

  it('triggers on every pull request and every push to main; NO workflow-level paths filter; NO job-level if', () => {
    expect(CI).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n/m);
    expect(CI).not.toMatch(/^\s*paths(-ignore)?:/m);
    for (const id of Object.keys(NAMES)) expect(jobBlock(id), id).not.toMatch(/^ {4}if:/m);
  });

  it('every required job asks the filter first (after checkout) and guards every expensive step; a skipped job ends green', () => {
    for (const [id, area] of Object.entries(AREA)) {
      const b = jobBlock(id);
      expect(b, id).toContain(`node scripts/ci/changed-areas.mjs --area ${area}`);
      expect(b.indexOf('actions/checkout@v4'), id).toBeLessThan(b.indexOf('changed-areas.mjs'));
      // steps after the filter: each uses/run must be guarded, except the filter itself and the explicit "Skipped" no-op
      const afterFilter = b.slice(b.indexOf('id: areas'));
      const steps = afterFilter.split(/\n {6}- /).slice(1);
      const unguarded = steps.filter((s) => !/steps\.areas\.outputs\.run (==|!=) 'true'|github\.ref == 'refs\/heads\/main'/.test(s));
      expect(unguarded.map((s) => s.split('\n')[0]), id).toEqual([]);
      expect(b, id).toMatch(/Skipped \(/);
      expect(b, id).toContain("steps.areas.outputs.run != 'true'");
    }
  });

  it('the filter step: fail-safe on a script crash, no secrets beyond the read-only token, no expression interpolated into a shell line', () => {
    expect(CI).toContain('|| { echo "run=true" >> "$GITHUB_OUTPUT"');
    expect(CI).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(CI).toMatch(/permissions:\n {2}contents: read\n {2}pull-requests: read\n/);
    const runLines = lines.filter((l) => /^\s*run:/.test(l));
    expect(runLines.filter((l) => l.includes('${{'))).toEqual([]);
  });

  it('push to main always runs everything: the filter only narrows pull_request events', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/ci/changed-areas.mjs'), 'utf8');
    expect(src).toContain("env.GITHUB_EVENT_NAME !== 'pull_request'");
  });
});
