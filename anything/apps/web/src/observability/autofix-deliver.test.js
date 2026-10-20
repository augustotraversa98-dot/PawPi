// @vitest-environment node
// Behavioural tests for scripts/autofix/{preflight,deliver,outcome}.sh: the REAL scripts and the REAL gate.mjs, run against a fake
// `gh` / `curl` / `sleep` on PATH and a real local git remote. Proves every branch of the loop without touching GitHub, Grafana or
// production: issue-only, missing PAT, gate refusals, the sha-pinned squash merge, production verification, the automatic revert,
// the kill switch, dedupe and the outcome comment. Needs bash, git, node and jq (all present on GitHub's ubuntu runners).
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '../../../../../scripts/autofix');
const have = (cmd) => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
const CAN_RUN = have('jq') && have('git') && have('bash');
const maybe = CAN_RUN ? describe : describe.skip;

const REPO = 'o/r';
const RUN_ID = '777';
// must live in an ALLOWED_DIRS folder of scripts/autofix/gate.mjs (the auto-merge allowlist)
const SRC = 'anything/apps/web/src/app/api/places/route.js';
const AUTH_SRC = 'anything/apps/web/src/app/api/auth/token/route.js';
const PAT = 'pat-token-SECRET';
const DEFAULT_TOKEN = 'default-token';
const GRAFANA_TOKEN = 'graf-annotation-SECRET';
const tmpRoots = [];
afterAll(() => { for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true }); });

const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs'); const cp = require('child_process');
const dir = process.env.FAKE_DIR; const args = process.argv.slice(2);
const log = (o) => fs.appendFileSync(dir + '/calls.jsonl', JSON.stringify(o) + '\\n');
if (args[0] !== 'api') { log({ unsupported: args }); console.error('fake gh: unsupported ' + args.join(' ')); process.exit(1); }
let method = null, endpoint = null, jq = null; const fields = {};
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '-X') method = args[++i];
  else if (a === '-f' || a === '-F') { const kv = args[++i]; const ix = kv.indexOf('='); const k = kv.slice(0, ix); let v = kv.slice(ix + 1); if (a === '-F' && v.startsWith('@')) v = fs.readFileSync(v.slice(1), 'utf8'); if (k.endsWith('[]')) (fields[k] = fields[k] || []).push(v); else fields[k] = v; }
  else if (a === '--jq') jq = args[++i];
  else if (a.startsWith('--')) {}
  else if (!endpoint) endpoint = a;
}
if (!method) method = Object.keys(fields).length ? 'POST' : 'GET';
const rules = JSON.parse(fs.readFileSync(dir + '/rules.json', 'utf8'));
const cf = dir + '/counters.json'; const counters = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : {};
const key = method + ' ' + endpoint;
const idx = rules.findIndex((r) => new RegExp(r.match).test(key));
log({ method, endpoint, fields, token: process.env.GH_TOKEN === ${JSON.stringify(PAT)} ? 'pat' : process.env.GH_TOKEN === ${JSON.stringify(DEFAULT_TOKEN)} ? 'default' : 'other', matched: idx });
if (idx < 0) { console.error('{"message":"Not Found"}'); process.exit(1); }
const n = counters[idx] || 0; counters[idx] = n + 1; fs.writeFileSync(cf, JSON.stringify(counters));
const r = rules[idx]; const body = r.bodies[Math.min(n, r.bodies.length - 1)];
if (r.status && r.status >= 400) { console.error(JSON.stringify(body)); process.exit(1); }
const text = JSON.stringify(body);
if (jq) { const o = cp.spawnSync('jq', ['-r', jq], { input: text, encoding: 'utf8' }); process.stdout.write(o.stdout); process.exit(o.status); }
process.stdout.write(text + '\\n');
`;

const FAKE_CURL = `#!/usr/bin/env node
const fs = require('fs'); const dir = process.env.FAKE_DIR; const args = process.argv.slice(2);
let url = null, w = null, method = 'GET', data = null, auth = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-o' || a === '--max-time') i++;
  else if (a === '-w') w = args[++i];
  else if (a === '-X') method = args[++i];
  else if (a === '-H') { const h = args[++i]; if (/^authorization/i.test(h)) auth = 'present'; }
  else if (a === '--data-binary') { data = args[++i]; if (data === '@-') data = fs.readFileSync(0, 'utf8'); }
  else if (a.startsWith('-')) {}
  else url = a;
}
const rules = JSON.parse(fs.readFileSync(dir + '/curl.json', 'utf8'));
const cf = dir + '/curl-counters.json'; const counters = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : {};
const idx = rules.findIndex((r) => new RegExp(r.match).test(url));
fs.appendFileSync(dir + '/calls.jsonl', JSON.stringify({ curl: url, method, auth, data, matched: idx }) + '\\n');
if (idx < 0) { process.stdout.write(w ? '000' : ''); process.exit(7); }
const n = counters[idx] || 0; counters[idx] = n + 1; fs.writeFileSync(cf, JSON.stringify(counters));
const r = rules[idx];
if (w) { process.stdout.write(String((r.codes || [200])[Math.min(n, (r.codes || [200]).length - 1)])); process.exit(0); }
const b = (r.bodies || [''])[Math.min(n, (r.bodies || ['']).length - 1)];
process.stdout.write(typeof b === 'string' ? b : JSON.stringify(b));
`;

const sh = (cwd, cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};

const INCIDENT_HIGH = '# Incident\n\nRoot cause traced to a null deref in places/route.js.\n\nCONFIDENCE: high\n';
const prObj = (n, head, over = {}) => ({ number: n, state: 'open', draft: false, merged: false, head: { ref: `autofix/ManualTest-${RUN_ID}`, sha: head, repo: { full_name: REPO } }, base: { ref: 'main' }, labels: [{ name: 'autofix' }], ...over });
const okChecks = (names = ['mobile (jest)', 'web (vitest)', 'web (integration / real Postgres)']) => ({ check_runs: names.map((name, i) => ({ id: i + 1, name, status: 'completed', conclusion: 'success' })) });
const PATCH_OK = '@@ -1,3 +1,3 @@\n export async function GET() {\n-  return Response.json({ ok: true });\n+  return Response.json({ ok: true, fixed: 1 });\n }';
const goodFile = (filename = SRC) => ({ filename, status: 'modified', additions: 1, deletions: 1, changes: 2, patch: PATCH_OK });
const recentMerged = (n, h = 1) => ({ number: n, labels: [{ name: 'autofix' }], pull_request: { merged_at: new Date(Date.now() - h * 3600e3).toISOString() } });

/** Build an isolated world: fake bin dir, bare remote + clone, result dir, state files. */
function world({ patch = true, incident = INCIDENT_HIGH, rules = [], curl = [], env = {}, pat = PAT } = {}) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'autofix-'));
  tmpRoots.push(root);
  const bin = path.join(root, 'bin'); const fake = path.join(root, 'fake'); const result = path.join(root, 'result');
  fs.mkdirSync(bin); fs.mkdirSync(fake); fs.mkdirSync(result);
  for (const [name, src] of [['gh', FAKE_GH], ['curl', FAKE_CURL], ['sleep', '#!/bin/sh\nexit 0\n']]) {
    fs.writeFileSync(path.join(bin, name), src, { mode: 0o755 });
  }
  // remote with main = base commit; clone BEFORE adding the simulated squash commit
  const remote = path.join(root, 'remote.git'); const work = path.join(root, 'work'); const other = path.join(root, 'other');
  sh(root, 'git', ['init', '-q', '--bare', '-b', 'main', remote]);
  sh(root, 'git', ['clone', '-q', remote, other]);
  for (const f of [SRC, AUTH_SRC]) { fs.mkdirSync(path.join(other, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(other, f), `export async function GET() {\n  return Response.json({ ok: true });\n}\n`); }
  sh(other, 'git', ['add', '-A']); sh(other, 'git', ['commit', '-q', '-m', 'base']); sh(other, 'git', ['push', '-q', 'origin', 'HEAD:main']);
  sh(root, 'git', ['clone', '-q', remote, work]);
  // the change Claude "made", as the investigate job would package it
  const change = (dir) => fs.writeFileSync(path.join(dir, SRC), `export async function GET() {\n  return Response.json({ ok: true, fixed: 1 });\n}\n`);
  change(other); sh(other, 'git', ['add', '-A']);
  const patchText = sh(other, 'git', ['diff', '--cached', '--binary']) + '\n';
  sh(other, 'git', ['commit', '-q', '-m', 'simulated squash merge']); sh(other, 'git', ['push', '-q', 'origin', 'HEAD:main']);
  const mergeSha = sh(other, 'git', ['rev-parse', 'HEAD']);
  if (patch) fs.writeFileSync(path.join(result, 'changes.patch'), patchText);
  if (incident !== null) fs.writeFileSync(path.join(result, 'incident.md'), incident);
  fs.writeFileSync(path.join(fake, 'rules.json'), JSON.stringify(rules));
  fs.writeFileSync(path.join(fake, 'curl.json'), JSON.stringify(curl));
  const ghEnv = path.join(root, 'github_env'); const summary = path.join(root, 'summary');
  fs.writeFileSync(ghEnv, ''); fs.writeFileSync(summary, '');
  const base = {
    PATH: `${bin}:${process.env.PATH}`, FAKE_DIR: fake, GH_TOKEN: DEFAULT_TOKEN, AUTOFIX_PAT: pat, GITHUB_REPOSITORY: REPO, GITHUB_RUN_ID: RUN_ID,
    GITHUB_SERVER_URL: 'https://github.com', GITHUB_ENV: ghEnv, GITHUB_STEP_SUMMARY: summary, ALERT_NAME: 'ManualTest', ISSUE_ONLY: 'false',
    ALLOW_MERGE: 'true', RESULT_DIR: result, AUTOFIX_GIT_REMOTE: remote, AUTOFIX_POLL_SECONDS: '0', AUTOFIX_VERIFY_POLL_SECONDS: '0',
    CHECKS_TIMEOUT_MINUTES: '0', DEPLOY_TIMEOUT_MINUTES: '0', PROD_URL: 'https://prod.invalid', GITHUB_OUTPUT: path.join(root, 'github_output'),
    GRAFANA_URL: '', GRAFANA_ANNOTATION_TOKEN: '', ...env,
  };
  fs.writeFileSync(base.GITHUB_OUTPUT, '');
  const readCalls = () => (fs.existsSync(path.join(fake, 'calls.jsonl')) ? fs.readFileSync(path.join(fake, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const readKv = (file) => Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const runScript = (script, over = {}, cwd = work) => {
    const r = spawnSync('bash', [path.join(SCRIPTS, script)], { cwd, encoding: 'utf8', env: { ...base, ...over, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
    return { code: r.status, out: r.stdout + r.stderr, calls: readCalls(), state: readKv(ghEnv), outputs: readKv(base.GITHUB_OUTPUT), summary: fs.readFileSync(summary, 'utf8'), remote, work, mergeSha, root };
  };
  return { runScript, mergeSha, remote, work, base };
}

const HEAD = 'a1'.repeat(20);
const REVHEAD = 'b2'.repeat(20);
const REVMERGE = 'c3'.repeat(20);
const merged = (calls) => calls.filter((c) => c.method === 'PUT' && /\/merge$/.test(c.endpoint));
const creates = (calls, re) => calls.filter((c) => c.method === 'POST' && re.test(c.endpoint));
const R = (match, ...bodies) => ({ match, bodies });
const ISSUE_LIST_OPEN = R(`^GET repos/${REPO}/issues\\?state=open&labels=autofix`, []);

/** Rules for "a PR got opened and everything on GitHub looks fine". */
function prRules({ mergeSha, files = [goodFile()], checks = okChecks(), closedAutofix = [], closedRevert = [], mergeBody, prNumbers = [7], extra = [] } = {}) {
  return [
    R(`^POST repos/${REPO}/issues$`, { number: 50 }),
    ISSUE_LIST_OPEN,
    R(`^POST repos/${REPO}/pulls$`, ...prNumbers.map((n, i) => ({ number: n, head: { sha: i === 0 ? HEAD : REVHEAD } }))),
    R(`^POST repos/${REPO}/issues/\\d+/labels$`, []),
    R(`^POST repos/${REPO}/issues/\\d+/comments$`, {}),
    R(`^GET repos/${REPO}/pulls/7$`, prObj(7, HEAD)),
    R(`^GET repos/${REPO}/pulls/7/files`, files),
    R(`^GET repos/${REPO}/commits/${HEAD}/check-runs`, checks),
    R(`^GET repos/${REPO}/commits/${REVHEAD}/check-runs`, okChecks()),
    R(`^GET repos/${REPO}/actions/variables/AUTOFIX_ENABLED`, { value: 'true' }),
    R(`^GET repos/${REPO}/issues\\?state=closed&labels=autofix&`, closedAutofix),
    R(`^GET repos/${REPO}/issues\\?state=closed&labels=autofix-revert&`, closedRevert),
    R(`^PUT repos/${REPO}/pulls/7/merge$`, mergeBody ?? { merged: true, sha: mergeSha }),
    R(`^PUT repos/${REPO}/pulls/8/merge$`, { merged: true, sha: REVMERGE }),
    ...extra,
  ];
}
const healthy = (sha, version = sha.slice(0, 7)) => ({ match: '/api/health/deep$', bodies: [{ ok: true, db_ms: 5, version }] });
const status200 = [{ match: '/api/auth/session$', codes: [200] }, { match: '/api/telemetry/config$', codes: [200] }];

maybe('deliver.sh: nothing to merge -> issue', () => {
  it('no code change: opens ONE needs-human issue with the report, never a PR', () => {
    const w = world({ patch: false, rules: prRules({}) });
    const r = w.runScript('deliver.sh');
    expect(r.code).toBe(0);
    const issue = creates(r.calls, new RegExp(`^repos/${REPO}/issues$`));
    expect(issue).toHaveLength(1);
    expect(issue[0].fields.title).toBe('🔎 Grafana alert (no auto-fix): ManualTest');
    expect(issue[0].fields['labels[]']).toEqual(['autofix', 'needs-human']);
    expect(issue[0].fields.body).toContain('Root cause traced');
    expect(issue[0].fields.body).toContain(`actions/runs/${RUN_ID}`);
    expect(creates(r.calls, /\/pulls$/)).toHaveLength(0);
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state).toMatchObject({ OUTCOME: 'left_for_human', TARGET_KIND: 'issue', TARGET_NUMBER: '50' });
    expect(r.state.DETAIL).toMatch(/diagnosis only/);
  });

  it('a re-fire comments on the open issue instead of opening another', () => {
    const open = [{ number: 12, title: '🔎 Grafana alert (no auto-fix): ManualTest' }, { number: 13, title: 'other', pull_request: {} }];
    const w = world({ patch: false, rules: [R(`^GET repos/${REPO}/issues\\?state=open&labels=autofix`, open), ...prRules({})] });
    const r = w.runScript('deliver.sh');
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/issues$`))).toHaveLength(0);
    expect(creates(r.calls, /issues\/12\/comments$/)).toHaveLength(1);
    expect(r.state).toMatchObject({ TARGET_NUMBER: '12', OUTCOME: 'left_for_human' });
  });

  it('issue-only alert (P1-ServerMetricsSilent): a proposed patch is DISCARDED, no PR, no push', () => {
    const w = world({ patch: true, env: { ALERT_NAME: 'P1-ServerMetricsSilent', ISSUE_ONLY: 'true' }, rules: prRules({}) });
    const r = w.runScript('deliver.sh');
    expect(creates(r.calls, /\/pulls$/)).toHaveLength(0);
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/issues$`))[0].fields.title).toContain('P1-ServerMetricsSilent');
    expect(r.state.DETAIL).toMatch(/issue only/);
    expect(sh(w.remote, 'git', ['branch', '--list', 'autofix/*'])).toBe('');
  });

  it('no report from the investigate job: still opens an issue saying so', () => {
    const w = world({ patch: false, incident: null, rules: prRules({}) });
    const r = w.runScript('deliver.sh');
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/issues$`))[0].fields.body).toMatch(/produced no report/);
  });
});

maybe('deliver.sh: AUTOFIX_PAT is required to open a PR', () => {
  it('missing PAT: needs-human issue that says so, patch attached, nothing pushed, no PR', () => {
    const w = world({ pat: '', rules: prRules({}) });
    const r = w.runScript('deliver.sh');
    expect(r.code).toBe(0);
    const issue = creates(r.calls, new RegExp(`^repos/${REPO}/issues$`));
    expect(issue).toHaveLength(1);
    expect(issue[0].fields.title).toMatch(/AUTOFIX_PAT secret missing/);
    expect(issue[0].fields.body).toMatch(/`AUTOFIX_PAT` is not set/);
    expect(issue[0].fields.body).toContain('fixed: 1'); // the proposed patch
    expect(issue[0].fields['labels[]']).toContain('needs-human');
    expect(creates(r.calls, /\/pulls$/)).toHaveLength(0);
    expect(sh(w.remote, 'git', ['branch', '--list', 'autofix/*'])).toBe('');
    expect(r.state.OUTCOME).toBe('left_for_human');
    expect(r.state.DETAIL).toMatch(/AUTOFIX_PAT/);
  });

  it('a patch that does not apply becomes an issue, not a silent failure', () => {
    const w = world({ rules: prRules({}) });
    fs.writeFileSync(path.join(w.base.RESULT_DIR, 'changes.patch'), 'diff --git a/nope b/nope\n--- a/nope\n+++ b/nope\n@@ -1 +1 @@\n-x\n+y\n');
    const r = w.runScript('deliver.sh');
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/issues$`))[0].fields.title).toMatch(/could not open PR/);
    expect(r.state.DETAIL).toMatch(/does not apply/);
  });

  it('a rejected push becomes an issue and never leaks the PAT', () => {
    const w = world({ rules: prRules({}), env: { AUTOFIX_GIT_REMOTE: '/nonexistent/remote.git' } });
    const r = w.runScript('deliver.sh');
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/issues$`))[0].fields.title).toMatch(/could not open PR/);
    expect(JSON.stringify(r.calls)).not.toContain(PAT);
    expect(r.out + r.summary).not.toContain(PAT);
  });
});

maybe('deliver.sh: the merge gate', () => {
  const run = (over = {}, ruleOpts = {}, env = {}) => {
    const w = world({ ...over, rules: prRules({ ...ruleOpts }), curl: [], env });
    // mergeSha is only known after world() builds the repo
    const rules = prRules({ mergeSha: w.mergeSha, ...ruleOpts });
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), JSON.stringify(rules));
    return w.runScript('deliver.sh');
  };

  it('PR is opened with the PAT, labelled autofix, and a failing gate leaves it for a human WITHOUT merging or waiting on CI', () => {
    const r = run({ incident: '# no confidence line' });
    const pr = creates(r.calls, new RegExp(`^repos/${REPO}/pulls$`));
    expect(pr).toHaveLength(1);
    expect(pr[0].token).toBe('pat');
    expect(pr[0].fields).toMatchObject({ head: `autofix/ManualTest-${RUN_ID}`, base: 'main' });
    expect(creates(r.calls, /issues\/7\/labels$/).map((c) => c.fields['labels[]'][0])).toEqual(expect.arrayContaining(['autofix', 'needs-human']));
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.calls.some((c) => /check-runs/.test(c.endpoint || ''))).toBe(false);
    expect(r.state).toMatchObject({ OUTCOME: 'left_for_human', PR_NUMBER: '7', TARGET_KIND: 'pr' });
    expect(r.state.DETAIL).toMatch(/CONFIDENCE: high/);
    expect(sh(r.remote, 'git', ['branch', '--list', 'autofix/*'])).toContain(`autofix/ManualTest-${RUN_ID}`);
  });

  it.each([
    ['a sensitive path (auth)', { files: [goodFile(AUTH_SRC)] }, /sensitive/],
    ['too many files', { files: Array.from({ length: 6 }, (_, i) => goodFile(`anything/apps/web/src/lib/f${i}.js`)) }, /6 files/],
    ['too many lines', { files: [{ ...goodFile(), additions: 60, deletions: 30 }] }, /90 changed lines/],
    ['a package file', { files: [goodFile('anything/apps/web/package.json')] }, /package\/lock/],
    ['a workflow file', { files: [goodFile('.github/workflows/ci.yml')] }, /workflow/],
    ['a file outside web/src', { files: [goodFile('anything/apps/mobile/src/x.js')] }, /outside/],
    ['a web/src folder that is not on the allowlist (pets)', { files: [goodFile('anything/apps/web/src/app/api/pets/route.js')] }, /outside the auto-merge allowlist/],
    ['a sensitive word inside an allowed folder (order)', { files: [goodFile('anything/apps/web/src/app/api/places/order/route.js')] }, /sensitive/],
    ['a test file', { files: [goodFile('anything/apps/web/src/app/api/places/route.test.js')] }, /test\/fixture\/config/],
    ['a code edit together with a test edit', { files: [goodFile(), goodFile('anything/apps/web/src/app/api/places/route.test.js')] }, /may not edit the tests/],
    ['a NEW file', { files: [{ ...goodFile('anything/apps/web/src/app/api/places/new.js'), status: 'added' }] }, /new, removed, renamed or copied/],
    ['a diff that adds an import', { files: [{ ...goodFile(), patch: '@@ -1 +1,2 @@\n+import fs from "node:fs";\n x' }] }, /adds an import/],
    ['a diff that adds an env read', { files: [{ ...goodFile(), patch: '@@ -1 +1 @@\n+const k = process.env.SECRET_KEY;' }] }, /adds an import\/require, env/],
    ['a diff GitHub did not return (cannot be inspected)', { files: [{ ...goodFile(), patch: undefined }] }, /cannot be inspected/],
  ])('refuses %s', (_n, ruleOpts, re) => {
    const r = run({}, ruleOpts);
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.OUTCOME).toBe('left_for_human');
    expect(r.state.DETAIL).toMatch(/gate failed/);
    expect(r.state.DETAIL).toMatch(re);
    expect(creates(r.calls, /issues\/7\/labels$/).some((c) => c.fields['labels[]'][0] === 'needs-human')).toBe(true);
  });

  it('a failed required check leaves it for a human (no merge)', () => {
    const bad = okChecks(); bad.check_runs[1].conclusion = 'failure';
    const r = run({}, { checks: bad });
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/required check failed/);
  });

  it('checks still pending at the timeout: left for a human, no merge', () => {
    const pending = okChecks(); pending.check_runs[2] = { id: 3, name: 'web (integration / real Postgres)', status: 'in_progress' };
    const r = run({}, { checks: pending });
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/timed out/);
  });

  it('a missing required check is pending, never success', () => {
    const r = run({}, { checks: okChecks(['mobile (jest)', 'web (vitest)']) });
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/timed out/);
  });

  it('rate limit: 3 autofix PRs merged in 24h -> left for a human', () => {
    const r = run({}, { closedAutofix: [recentMerged(1), recentMerged(2), recentMerged(3)] });
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/rate limit.*3 autofix PRs/);
  });

  it('a merged autofix revert in the last 24h pauses auto-merge', () => {
    const rev = { number: 9, labels: [{ name: 'autofix-revert' }], pull_request: { merged_at: new Date(Date.now() - 3600e3).toISOString() } };
    const r = run({}, { closedRevert: [rev] });
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/revert/);
  });

  it('manual run without allow_merge: PR is opened but NEVER merged and CI is not even polled', () => {
    const r = run({}, {}, { ALLOW_MERGE: 'false' });
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/pulls$`))).toHaveLength(1);
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/auto-merge is disabled/);
    expect(r.calls.some((c) => /check-runs/.test(c.endpoint || ''))).toBe(false);
  });

  it('kill switch flipped while waiting for CI stops the merge', () => {
    const w = world({});
    const rules = prRules({ mergeSha: w.mergeSha }).map((x) => (x.match.includes('actions/variables') ? R(x.match, { value: 'false' }) : x));
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), JSON.stringify(rules));
    const r2 = w.runScript('deliver.sh');
    expect(merged(r2.calls)).toHaveLength(0);
    expect(r2.state.DETAIL).toMatch(/kill switch/);
  });

  it('the PR head changing while waiting stops the merge', () => {
    const w = world({});
    const rules = prRules({ mergeSha: w.mergeSha }).map((x) => (x.match === `^GET repos/${REPO}/pulls/7$` ? R(x.match, prObj(7, HEAD), prObj(7, 'f'.repeat(40))) : x));
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), JSON.stringify(rules));
    const r = w.runScript('deliver.sh');
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/head changed/);
  });

  it('a PR that is not this run\'s (wrong head branch) is never merged', () => {
    const w = world({});
    const rules = prRules({ mergeSha: w.mergeSha }).map((x) => (x.match === `^GET repos/${REPO}/pulls/7$` ? R(x.match, prObj(7, HEAD, { head: { ref: 'someone/else', sha: HEAD, repo: { full_name: REPO } } })) : x));
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), JSON.stringify(rules));
    const r = w.runScript('deliver.sh');
    expect(merged(r.calls)).toHaveLength(0);
    expect(r.state.DETAIL).toMatch(/head branch/);
  });

  it('the merge API refusing (409/405) is reported, not retried or forced', () => {
    const w = world({});
    const rules = prRules({ mergeSha: w.mergeSha }).map((x) => (x.match.includes('pulls/7/merge') ? { match: x.match, status: 409, bodies: [{ message: 'Head branch was modified' }] } : x));
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), JSON.stringify(rules));
    const r = w.runScript('deliver.sh');
    expect(merged(r.calls)).toHaveLength(1);
    expect(r.state.OUTCOME).toBe('left_for_human');
    expect(r.state.DETAIL).toMatch(/merge API refused/);
  });
});

maybe('deliver.sh: merge, verify production, revert', () => {
  const setup = ({ curl, env = {}, ruleOpts = {} } = {}) => {
    const w = world({ env });
    const rules = prRules({ mergeSha: w.mergeSha, prNumbers: [7, 8], ...ruleOpts });
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), JSON.stringify(rules));
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'curl.json'), JSON.stringify(curl(w.mergeSha)));
    return w;
  };

  it('HAPPY PATH: gate passes, 3 checks green -> sha-pinned SQUASH merge with the PAT, production verified -> merged', () => {
    const w = setup({ curl: (sha) => [healthy(sha), ...status200] });
    const r = w.runScript('deliver.sh');
    expect(r.code).toBe(0);
    const m = merged(r.calls);
    expect(m).toHaveLength(1);
    expect(m[0].endpoint).toBe(`repos/${REPO}/pulls/7/merge`);
    expect(m[0].token).toBe('pat');
    expect(m[0].fields).toMatchObject({ merge_method: 'squash', sha: HEAD });
    expect(m[0].fields.commit_title).toBe('autofix: ManualTest (#7)');
    // PAT used ONLY for create-PR and merge; every other call used the default token
    const patCalls = r.calls.filter((c) => c.token === 'pat').map((c) => `${c.method} ${c.endpoint}`);
    expect(patCalls).toEqual([`POST repos/${REPO}/pulls`, `PUT repos/${REPO}/pulls/7/merge`]);
    expect(r.state).toMatchObject({ OUTCOME: 'merged', MERGE_SHA: w.mergeSha });
    expect(r.state.VERIFY_DETAIL).toContain(`version ${w.mergeSha.slice(0, 7)}`);
    const urls = r.calls.filter((c) => c.curl).map((c) => c.curl);
    expect(urls).toEqual(expect.arrayContaining(['https://prod.invalid/api/health/deep', 'https://prod.invalid/api/auth/session', 'https://prod.invalid/api/telemetry/config']));
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/issues$`))).toHaveLength(0);
  });

  it('the gate runs BEFORE waiting for CI and the merge only happens after all three checks succeeded', () => {
    const w = setup({ curl: (sha) => [healthy(sha), ...status200] });
    const r = w.runScript('deliver.sh');
    const idx = (re) => r.calls.findIndex((c) => re.test(`${c.method} ${c.endpoint}`));
    expect(idx(/files/)).toBeGreaterThan(-1);
    expect(idx(/files/)).toBeLessThan(idx(/check-runs/));
    expect(idx(/check-runs/)).toBeLessThan(idx(/PUT .*merge/));
    expect(idx(/actions\/variables/)).toBeLessThan(idx(/PUT .*merge/));
  });

  it('old deploy still serving (version != merged sha) fails verification -> REVERT: revert PR, checks, pinned merge, issue, annotation', () => {
    const w = setup({
      env: { GRAFANA_URL: 'https://grafana.invalid', GRAFANA_ANNOTATION_TOKEN: GRAFANA_TOKEN },
      curl: (sha) => [
        { match: '/api/health/deep$', bodies: [{ ok: true, version: '2baa222' }, { ok: true, version: REVMERGE.slice(0, 7) }] },
        ...status200,
        { match: '/api/annotations$', bodies: ['{}'], codes: [200] },
      ],
    });
    const r = w.runScript('deliver.sh');
    expect(r.code).toBe(0);
    const m = merged(r.calls);
    expect(m.map((c) => c.endpoint)).toEqual([`repos/${REPO}/pulls/7/merge`, `repos/${REPO}/pulls/8/merge`]);
    expect(m[1].fields).toMatchObject({ merge_method: 'squash', sha: REVHEAD }); // revert merge is sha-pinned too
    const prs = creates(r.calls, new RegExp(`^repos/${REPO}/pulls$`));
    expect(prs).toHaveLength(2);
    expect(prs[1].token).toBe('pat');
    expect(prs[1].fields.title).toBe('Revert: autofix ManualTest (#7)');
    expect(prs[1].fields.head).toBe(`autofix-revert/ManualTest-${RUN_ID}`);
    expect(creates(r.calls, /issues\/8\/labels$/)[0].fields['labels[]']).toEqual(['autofix-revert']);
    // the revert branch really contains a git revert of the merge commit
    const log = sh(w.remote, 'git', ['log', '--format=%s', `autofix-revert/ManualTest-${RUN_ID}`, '-1']);
    expect(log).toMatch(/^Revert /);
    expect(sh(w.remote, 'git', ['show', `autofix-revert/ManualTest-${RUN_ID}:${SRC}`])).not.toContain('fixed: 1');
    // incident issue + annotation
    const issue = creates(r.calls, new RegExp(`^repos/${REPO}/issues$`));
    expect(issue).toHaveLength(1);
    expect(issue[0].fields.title).toBe('🚨 Autofix reverted: ManualTest (PR #7)');
    expect(issue[0].fields['labels[]']).toEqual(['autofix', 'needs-human']);
    expect(issue[0].fields.body).toContain('Root cause traced'); // the incident report
    expect(issue[0].fields.body).toMatch(/Verification failure: .*did not report ok:true with version .* \(version 2baa222 != /);
    const ann = r.calls.find((c) => c.curl && /annotations/.test(c.curl));
    expect(ann).toMatchObject({ method: 'POST', auth: 'present' });
    expect(JSON.parse(ann.data).tags).toEqual(['pawpi', 'autofix', 'revert']);
    expect(r.out + r.summary + JSON.stringify(r.calls)).not.toContain(GRAFANA_TOKEN);
    expect(r.state).toMatchObject({ OUTCOME: 'reverted', REVERT_PR_NUMBER: '8', REVERT_ISSUE_NUMBER: '50' });
    expect(r.state.REVERT_DETAIL).toMatch(/merged as .* and production verified/);
  });

  it('a failing /api/auth/session after the deploy also reverts; annotation is skipped (and says so) without a token', () => {
    const w = setup({
      curl: (sha) => [healthy(sha), { match: '/api/auth/session$', codes: [500] }, { match: '/api/telemetry/config$', codes: [200] }],
    });
    // after the revert, production verification (2nd health call) is not satisfiable for the revert sha: that is reported, not hidden
    const r = w.runScript('deliver.sh');
    expect(r.state.OUTCOME).toBe('reverted');
    expect(r.state.VERIFY_DETAIL).toBe('/api/auth/session returned HTTP 500 instead of 200');
    expect(merged(r.calls)).toHaveLength(2);
    expect(r.summary).toMatch(/annotation skipped/);
    expect(r.calls.some((c) => c.curl && /annotations/.test(c.curl))).toBe(false);
    expect(r.state.REVERT_DETAIL).toMatch(/URGENT|verification still failed/);
  });

  it('revert PR whose checks never go green is left OPEN for a human (needs-human), not merged', () => {
    const bad = okChecks(); bad.check_runs[0].conclusion = 'failure';
    const w = setup({
      curl: () => [{ match: '/api/health/deep$', bodies: [{ ok: true, version: 'old0000' }] }, ...status200],
    });
    const rules = JSON.parse(fs.readFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), 'utf8')).map((x) => (x.match.includes(REVHEAD) ? R(x.match, bad) : x));
    fs.writeFileSync(path.join(w.base.FAKE_DIR, 'rules.json'), JSON.stringify(rules));
    const r = w.runScript('deliver.sh');
    expect(merged(r.calls).map((c) => c.endpoint)).toEqual([`repos/${REPO}/pulls/7/merge`]);
    expect(creates(r.calls, /issues\/8\/labels$/).map((c) => c.fields['labels[]'][0])).toEqual(['autofix-revert', 'needs-human']);
    expect(r.state.OUTCOME).toBe('reverted');
    expect(r.state.REVERT_DETAIL).toMatch(/OPEN.*URGENT/);
  });

  it('a revert that does not apply cleanly is reported for a human instead of forcing anything', () => {
    const w = setup({ curl: () => [{ match: '/api/health/deep$', bodies: [{ ok: true, version: 'old0000' }] }, ...status200] });
    // main moves on: the next commit edits the same lines the merge touched
    const other = path.join(w.base.RESULT_DIR, '..', 'other');
    fs.writeFileSync(path.join(other, SRC), 'export const completely = "different";\n');
    sh(other, 'git', ['commit', '-q', '-am', 'main moved on']); sh(other, 'git', ['push', '-q', 'origin', 'HEAD:main']);
    const r = w.runScript('deliver.sh');
    expect(r.state.OUTCOME).toBe('reverted');
    expect(r.state.REVERT_DETAIL).toMatch(/FAILED: git revert does not apply cleanly/);
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/pulls$`))).toHaveLength(1); // no revert PR
    expect(creates(r.calls, new RegExp(`^repos/${REPO}/issues$`))[0].fields.title).toMatch(/Autofix reverted/);
  });
});

maybe('outcome.sh: always comments the outcome', () => {
  const rules = [R(`^POST repos/${REPO}/issues/\\d+/comments$`, {}), R(`^POST repos/${REPO}/issues/\\d+/labels$`, []), R(`^POST repos/${REPO}/issues$`, { html_url: 'https://github.com/o/r/issues/99' })];
  const out = (env) => world({ rules }).runScript('outcome.sh', { JOB_STATUS: 'success', ...env });
  const comments = (calls) => calls.filter((c) => /comments$/.test(c.endpoint));

  it('merged: comments on the PR with the merge and verification details, no needs-human label', () => {
    const r = out({ OUTCOME: 'merged', TARGET_KIND: 'pr', TARGET_NUMBER: '7', MERGE_SHA: 'abcdef1234567', VERIFY_DETAIL: 'all good' });
    const c = comments(r.calls);
    expect(c).toHaveLength(1);
    expect(c[0].endpoint).toBe(`repos/${REPO}/issues/7/comments`);
    expect(c[0].fields.body).toMatch(/Autofix outcome: merged.*abcdef1.*all good/);
    expect(r.calls.some((x) => /labels$/.test(x.endpoint))).toBe(false);
  });

  it('left for human on a PR: comment + needs-human label', () => {
    const r = out({ OUTCOME: 'left_for_human', DETAIL: 'gate failed: 6 files changed', TARGET_KIND: 'pr', TARGET_NUMBER: '7' });
    expect(comments(r.calls)[0].fields.body).toMatch(/left for a human.*gate failed: 6 files changed/);
    expect(r.calls.find((x) => /7\/labels$/.test(x.endpoint)).fields['labels[]']).toEqual(['needs-human']);
  });

  it('reverted: comments on the original PR AND the incident issue', () => {
    const r = out({ OUTCOME: 'reverted', TARGET_KIND: 'pr', TARGET_NUMBER: '7', MERGE_SHA: 'abcdef1234567', VERIFY_DETAIL: 'boom', REVERT_DETAIL: 'revert PR #8 merged', REVERT_ISSUE_NUMBER: '60' });
    expect(comments(r.calls).map((c) => c.endpoint)).toEqual([`repos/${REPO}/issues/7/comments`, `repos/${REPO}/issues/60/comments`]);
    expect(comments(r.calls)[0].fields.body).toMatch(/reverted.*boom.*#60/);
  });

  it('no verdict (crash) on a PR: says so and labels needs-human; merged-but-unverified shouts', () => {
    const crash = out({ TARGET_KIND: 'pr', TARGET_NUMBER: '7', JOB_STATUS: 'failure' });
    expect(comments(crash.calls)[0].fields.body).toMatch(/stopped before reaching a verdict \(job status: failure\)/);
    expect(crash.calls.some((x) => /7\/labels$/.test(x.endpoint))).toBe(true);
    const unverified = out({ OUTCOME: 'merged_unverified', TARGET_KIND: 'pr', TARGET_NUMBER: '7', MERGE_SHA: 'abcdef1234567', JOB_STATUS: 'cancelled' });
    expect(comments(unverified.calls)[0].fields.body).toMatch(/merged, NOT verified.*CHECK PRODUCTION/);
  });

  it('nothing was created before the crash: opens a needs-human issue so it is never silent', () => {
    const r = out({ JOB_STATUS: 'failure' });
    expect(comments(r.calls)).toHaveLength(0);
    const issue = r.calls.find((c) => c.endpoint === `repos/${REPO}/issues`);
    expect(issue.fields.title).toBe('⚠️ Autofix workflow error: ManualTest');
    expect(issue.fields['labels[]']).toEqual(['autofix', 'needs-human']);
  });
});

maybe('preflight.sh: kill switch, dedupe, labels', () => {
  const pre = (env, rules = []) => {
    const w = world({ rules: [R(`^GET repos/${REPO}/pulls\\?state=open`, []), R(`^POST repos/${REPO}/labels$`, {}), ...rules] });
    return w.runScript('preflight.sh', { PAYLOAD: 'null', IN_NAME: 'ManualTest', IN_SUMMARY: 'loop test - no code change expected', IN_ALLOW: 'false', AUTOFIX_ENABLED: '', ...env });
  };

  it('KILL SWITCH (AUTOFIX_ENABLED=false): run=false, summary says so, GitHub is not even called', () => {
    const r = pre({ AUTOFIX_ENABLED: 'false' });
    expect(r.code).toBe(0);
    expect(r.outputs).toMatchObject({ run: 'false', killed: 'true' });
    expect(r.summary).toMatch(/switched OFF.*AUTOFIX_ENABLED=false/);
    expect(r.calls).toHaveLength(0);
  });

  it('DEDUPE: an open autofix PR for the same alert -> run=false, no labels, no work', () => {
    const open = [{ number: 5, labels: [{ name: 'autofix' }], head: { ref: 'autofix/ManualTest-123' } }];
    const w = world({ rules: [R(`^GET repos/${REPO}/pulls\\?state=open`, open), R(`^POST repos/${REPO}/labels$`, {})] });
    const r2 = w.runScript('preflight.sh', { PAYLOAD: 'null', IN_NAME: 'ManualTest', AUTOFIX_ENABLED: '' });
    expect(r2.outputs).toMatchObject({ run: 'false', duplicate: '5' });
    expect(r2.summary).toMatch(/Dedupe: open autofix PR #5/);
    expect(creates(r2.calls, /\/labels$/)).toHaveLength(0);
  });

  it('a different alert, or a PR without the label, does not block; the three labels are ensured', () => {
    const open = [{ number: 5, labels: [{ name: 'autofix' }], head: { ref: 'autofix/P1-DbErrors-123' } }, { number: 6, labels: [], head: { ref: 'autofix/ManualTest-9' } }];
    const w = world({ rules: [R(`^GET repos/${REPO}/pulls\\?state=open`, open), R(`^POST repos/${REPO}/labels$`, {})] });
    const r = w.runScript('preflight.sh', { PAYLOAD: 'null', IN_NAME: 'ManualTest', AUTOFIX_ENABLED: 'true' });
    expect(r.outputs).toMatchObject({ run: 'true', killed: 'false', duplicate: '', issue_only: 'false', alert_name: 'ManualTest', source: 'manual' });
    expect(creates(r.calls, /\/labels$/).map((c) => c.fields.name)).toEqual(['autofix', 'needs-human', 'autofix-revert']);
  });

  it('manual runs never auto-merge unless allow_merge=true; relay dispatches may; issue-only alerts are flagged', () => {
    expect(pre({}).outputs.allow_merge).toBe('false');
    expect(pre({ IN_ALLOW: 'true' }).outputs.allow_merge).toBe('true');
    const relay = pre({ IN_NAME: '', PAYLOAD: JSON.stringify({ alertname: 'P1-HealthDeepFailing', source: 'grafana' }) });
    expect(relay.outputs).toMatchObject({ allow_merge: 'true', issue_only: 'true', alert_name: 'P1-HealthDeepFailing', run: 'true' });
  });

  it('an alert name that is not a real rule is ignored for relay dispatches (no run, no GitHub calls); a payload cannot claim to be manual', () => {
    const unknown = pre({ IN_NAME: '', PAYLOAD: JSON.stringify({ alertname: 'TotallyMadeUp', source: 'grafana' }) });
    expect(unknown.outputs).toMatchObject({ run: 'false', issue_only: 'false' });
    expect(unknown.summary).toMatch(/not a known rule/);
    expect(unknown.calls).toHaveLength(0);
    const claimsManual = pre({ IN_NAME: '', PAYLOAD: JSON.stringify({ alertname: 'TotallyMadeUp', source: 'manual' }) });
    expect(claimsManual.outputs).toMatchObject({ run: 'false' });
    expect(claimsManual.outputs.source).toBe('unknown');
    // real rule (alerts-as-code), legacy live rule, Grafana data-source alert: known
    for (const name of ['P1-Http5xxRate', 'HighServerErrorRate', 'DatasourceError']) {
      expect(pre({ IN_NAME: '', PAYLOAD: JSON.stringify({ alertname: name, source: 'grafana' }) }).outputs.run, name).toBe('true');
    }
  }, 30_000); // five real bash+node preflight runs in one test: the 5 s default flaked when two test files ran at once

  it('a hostile alertname cannot inject into outputs or branch names', () => {
    const r = pre({ IN_NAME: 'x\nrun=true\n../../evil;$(id)' });
    expect(r.outputs.alert_name).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    expect(r.outputs.alert_name).not.toContain('..');
    expect(r.outputs.alert_name).toContain('evil');
    expect(Object.keys(r.outputs).filter((k) => k === 'run')).toHaveLength(1);
  });
});
