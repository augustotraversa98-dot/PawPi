#!/usr/bin/env node
// Path-aware CI: decides whether one of the three required CI jobs has anything to test.
//
//   node scripts/ci/changed-areas.mjs --area mobile|web|integration
//
// Called as the FIRST step of each job in .github/workflows/ci.yml. It writes `run=true|false` (and `reason=...`) to
// $GITHUB_OUTPUT; the expensive steps of the job (setup, install, tests) carry `if: steps.areas.outputs.run == 'true'`. The job
// itself ALWAYS runs and ends green, so the required check names ("mobile (jest)", "web (vitest)",
// "web (integration / real Postgres)") always report `success`. (A job-level `if:` would report `skipped`, which GitHub's branch
// protection accepts but scripts/autofix/gate.mjs does not: it treats anything but `success` as failed.)
//
// FAIL SAFE: anything unsure runs everything: not a pull_request, API error, more than MAX_FILES changed files, an empty file list,
// or any changed path that no rule below maps. The "honesty test" (anything/apps/web/src/observability/ciAreas.test.js) fails CI
// when a tracked file is not covered by a rule, so a new code folder cannot silently fall outside every filter.
//
// Zero dependencies, Node >= 18 (preinstalled on GitHub's runners), no secrets (the read-only GITHUB_TOKEN only lists PR files).

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const AREAS = Object.freeze(['mobile', 'web', 'integration']);
const ALL = AREAS;
/** GitHub lists at most 3000 files of a PR (30 pages x 100): beyond that the list is incomplete, so run everything. */
export const MAX_FILES = 3000;

/**
 * Ordered rules, FIRST MATCH WINS. `areas`: the jobs that must run for a file matching `re`, or 'all' (run every job) or 'ignore'
 * (no job needs it). A file matching no rule is "unmapped": the runner treats it as 'all'; the honesty test fails.
 */
export const RULES = Object.freeze([
  // --- run everything -------------------------------------------------------------------------------------------------
  { re: /^\.github\//, areas: 'all', why: 'workflows / CI configuration' },
  { re: /^scripts\/ci\//, areas: 'all', why: 'the path filter itself' },
  { re: /^(package(-lock)?\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|\.nvmrc|\.node-version|\.tool-versions)$/, areas: 'all', why: 'root lockfile / toolchain pin' },
  // --- code ---------------------------------------------------------------------------------------------------------------
  // The web unit suite scans mobile sources (coverageGuardFs: screens + funnel emission) and the mobile telemetry registry mirror.
  { re: /^anything\/apps\/mobile\/src\//, areas: ['mobile', 'web'], why: 'mobile sources (also read by web coverage-guard + registry-mirror tests)' },
  { re: /^anything\/apps\/mobile\//, areas: ['mobile'], why: 'mobile app (assets, config, lockfile, tests)' },
  { re: /^anything\/apps\/web\//, areas: ['web', 'integration'], why: 'web app + API (lockfile included)' },
  { re: /^supabase\//, areas: ['web', 'integration'], why: 'migrations / verify SQL (integration boots them; unit tests read them)' },
  { re: /^(observability|scripts)\//, areas: ['web'], why: 'alerts/dashboards as code and repo scripts (web unit tests lint and run them)' },
  { re: /^docs\/(observability|ops)\//, areas: ['web'], why: 'docs that web unit tests read (telemetry contract, cron runbook)' },
  // --- no job needs these -------------------------------------------------------------------------------------------------
  { re: /^docs\//, areas: 'ignore', why: 'documentation' },
  { re: /^anything\/docs\//, areas: 'ignore', why: 'documentation' },
  { re: /^anything\/(apps\/)?[^/]+\.md$/, areas: 'ignore', why: 'implementation notes' },
  { re: /^[^/]+\.md$/, areas: 'ignore', why: 'root markdown' },
  { re: /^pawpi-brand-kit\//, areas: 'ignore', why: 'brand assets and guidelines (no test reads them)' },
  { re: /^demo-assets\//, areas: 'ignore', why: 'demo images (only a manual seed script reads them)' },
  { re: /^\.claude\//, areas: 'ignore', why: 'local agent tooling' },
  { re: /^(\.gitignore|\.gitleaks\.toml)$/, areas: 'ignore', why: 'ignore / secret-scan config (gitleaks has its own workflow)' },
  { re: /^Start PawPi[^/]*\.command$/, areas: 'ignore', why: 'local launcher' },
]);

/** @returns {{areas: string[]|'ignore'|null, why: string}} areas === null means "unmapped" (run everything). */
export function classify(file) {
  const p = String(file ?? '');
  for (const r of RULES) {
    if (r.re.test(p)) return { areas: r.areas === 'all' ? [...ALL] : r.areas === 'ignore' ? 'ignore' : [...r.areas], why: r.why };
  }
  return { areas: null, why: 'unmapped path' };
}

/**
 * @param {string[]} files  every path changed by the pull request (renames: both paths)
 * @param {string} area     'mobile' | 'web' | 'integration'
 * @returns {{run: boolean, reason: string}}
 */
export function decide(files, area) {
  if (!AREAS.includes(area)) return { run: true, reason: `unknown area "${area}": running (fail safe)` };
  if (!Array.isArray(files) || files.length === 0) return { run: true, reason: 'no changed-file list: running (fail safe)' };
  if (files.length >= MAX_FILES) return { run: true, reason: `${files.length} changed files (GitHub's list is capped at ${MAX_FILES}): running (fail safe)` };
  let ignored = 0;
  for (const f of files) {
    const c = classify(f);
    if (c.areas === null) return { run: true, reason: `"${f}" is not mapped to any area: running (fail safe)` };
    if (c.areas === 'ignore') { ignored += 1; continue; }
    if (c.areas.includes(area)) return { run: true, reason: `"${f}" (${c.why}) needs ${area}` };
  }
  return { run: false, reason: `none of the ${files.length} changed files needs ${area} (${ignored} need no job at all)` };
}

/** Changed files of a pull request via the REST API (paginated). Throws on any problem; the caller turns that into "run". */
export async function listPullRequestFiles({ repo, number, token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  const out = [];
  for (let page = 1; page <= 30; page += 1) {
    const res = await fetchImpl(`${apiUrl}/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error('unexpected API body');
    for (const f of batch) {
      if (f?.filename) out.push(String(f.filename));
      if (f?.previous_filename) out.push(String(f.previous_filename));
    }
    if (batch.length < 100) return out;
  }
  return out; // exactly MAX_FILES: decide() runs everything
}

function emit(name, value, env) {
  const line = `${name}=${String(value).replace(/[\r\n]+/g, ' ')}\n`;
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
}

/** Entry point (exported for tests). Never throws: every failure path decides "run". */
export async function main(argv, env = process.env, fetchImpl = fetch) {
  const i = argv.indexOf('--area');
  const area = i >= 0 ? argv[i + 1] : '';
  let result;
  try {
    if (env.GITHUB_EVENT_NAME !== 'pull_request') {
      result = { run: true, reason: `event "${env.GITHUB_EVENT_NAME || 'unknown'}" is not a pull request: everything runs` };
    } else {
      const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
      const number = event?.pull_request?.number ?? event?.number;
      if (!number || !env.GITHUB_REPOSITORY) throw new Error('no pull request number / repository');
      const files = await listPullRequestFiles({ repo: env.GITHUB_REPOSITORY, number, token: env.GITHUB_TOKEN, apiUrl: env.GITHUB_API_URL || 'https://api.github.com', fetchImpl });
      result = decide(files, area);
    }
  } catch (e) {
    result = { run: true, reason: `could not determine the changed files (${e.message}): running (fail safe)` };
  }
  emit('run', result.run, env);
  emit('reason', result.reason, env);
  const msg = `${area}: ${result.run ? 'RUN' : 'SKIP'} - ${result.reason}`;
  console.log(msg);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `- ${msg}\n`);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(() => process.exit(0), () => process.exit(0));
}
