#!/usr/bin/env node
// Safety gate for the Grafana-alert -> Claude -> PR -> merge -> deploy -> verify loop (.github/workflows/claude-autofix.yml).
// Node >= 18, ZERO dependencies. Every decision the loop makes about "may this be merged / is production healthy" lives
// HERE (pure functions, unit-tested in anything/apps/web/src/observability/autofix-gate.test.js) so the workflow YAML and
// shell glue stay thin. The workflow runs this file from a TRUSTED copy made before any model-written code can touch the
// checkout (see scripts/autofix/deliver.sh), never from the working tree Claude edited.
//
// CLI (stdin = JSON or text, stdout = ONE line of JSON; exit 0 even when the verdict is "no" - only usage/parse
// errors exit non-zero, so `set -e` shell glue reads the verdict from the JSON, not from the exit code):
//   gate.mjs context                           env: PAYLOAD, IN_NAME, IN_SUMMARY  -> sanitised alert context JSON
//   gate.mjs preflight --kill V                stdin: {alertname, openPrs[]}      -> {slug, killed, issueOnly, duplicate}
//   gate.mjs provenance --repo R --branch B --number N       stdin: PR object     -> {ok, reasons[]}
//   gate.mjs files                             stdin: PR files array              -> {ok, reasons[], files, lines}
//   gate.mjs confidence                        stdin: incident.md text            -> {high}
//   gate.mjs known --name N [--root R]                                            -> {known} (is N a real rule / legacy / datasource alert?)
//   gate.mjs ratelimit [--now ISO]             stdin: merged PR array             -> {blocked, count, reason}
//   gate.mjs checks --sha SHA                  stdin: check_runs array            -> {state: pending|success|failed, details}
//   gate.mjs health --sha SHORT                stdin: /api/health/deep body       -> {ok, reason}
//   gate.mjs annotation --text T [--tags a,b]                                     -> Grafana annotation body

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- policy constants (changing one is a reviewed commit)
/** Must equal the three job names in .github/workflows/ci.yml (a test pins this). */
export const REQUIRED_CHECKS = Object.freeze(['mobile (jest)', 'web (vitest)', 'web (integration / real Postgres)']);
/**
 * Alerts that investigate and open an issue, never a code change. Two kinds:
 *  - the app itself may be down (P1-ServerMetricsSilent, P1-HealthDeepFailing);
 *  - HighLatencyP95 (the legacy live rule): p95 is a tail statistic over very few requests at PawPi's current
 *    traffic, so one app-launch burst moves it, and past autofix runs chased that noise with speculative N+1 edits.
 *    The cause is infrastructure (cross-region DB round trips + pool queueing), so a human decides.
 */
export const ISSUE_ONLY_ALERTS = Object.freeze(['P1-ServerMetricsSilent', 'P1-HealthDeepFailing', 'HighLatencyP95', 'DatasourceError', 'DatasourceNoData']);
/**
 * Alerts that are real but are not rules in observability/grafana/alerts/*.json: the three legacy live rules and Grafana's own
 * data-source alerts. A relay dispatch for any other name is ignored (see isKnownAlert); manual runs are exempt.
 */
export const LEGACY_ALERTS = Object.freeze(['HighServerErrorRate', 'HighLatencyP95', 'PaymentFailuresSpike', 'DatasourceError', 'DatasourceNoData']);
/** Label keys that may reach the model (mirrors LABEL_ALLOWLIST in anything/apps/web/src/lib/alertRelayPayload.js; a test pins both). */
export const LABEL_ALLOWLIST = Object.freeze([
  'alertname', 'severity', 'area', 'route', 'app_version', 'method', 'status_class', 'op', 'event', 'kind', 'funnel', 'step',
  'platform', 'screen', 'grafana_folder',
]);
export const ALLOWED_PREFIX = 'anything/apps/web/src/';
/**
 * ALLOWLIST of low-risk folders (deterministic; replaces the old "anything under web/src except a denylist"). A change is only
 * auto-merged when EVERY file lives under one of these. Public/read-mostly directory endpoints, observability code and public-site
 * helpers only. Add a folder only in a reviewed commit; never add a folder that handles accounts, private pet data, payments,
 * orders, messages, uploads or access control.
 */
export const ALLOWED_DIRS = Object.freeze([
  `${ALLOWED_PREFIX}lib/telemetry/`,
  `${ALLOWED_PREFIX}lib/home/`,
  `${ALLOWED_PREFIX}lib/brand/`,
  `${ALLOWED_PREFIX}lib/legal/`,
  `${ALLOWED_PREFIX}app/api/places/`,
  `${ALLOWED_PREFIX}app/api/discover/`,
  `${ALLOWED_PREFIX}app/api/services/discover/`,
  `${ALLOWED_PREFIX}app/api/providers/discover/`,
]);
/** Even inside an allowed folder, any path containing one of these words is human-only (case-insensitive, whole path). */
export const SENSITIVE_PATH = /rls|consent|care|upload|internal|admin|cron|shop|order|redeem|payout|auth|session|payment|mercadopago|migrations?|supabase|utils\/sql/i;
/** Test/fixture/config files: an auto-merged PR may not edit them (the fix must pass tests it did not write). */
export const TEST_PATH = /(^|\/)(__tests__|__mocks__|__fixtures__|tests?|fixtures?)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(vitest|jest|vite)[^/]*\.config\.[cm]?[jt]s$|(^|\/)setup[^/]*\.[cm]?[jt]s$/i;
/** Added source lines that make a diff human-only: new imports/requires, process/env/network/fs/exec primitives, URLs, SQL DDL/DML/RLS verbs. */
export const DANGEROUS_ADDED_LINE = /child_process|\beval\s*\(|new\s+Function|process\.(env|exit|binding)|\bimport\b|\brequire\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|\bfs\.|https?:\/\/|\bexec(Sync)?\s*\(|\bspawn\s*\(|set_config|current_app_user_id|security\s+definer|\b(drop|alter|truncate|grant|revoke)\s|delete\s+from/i;
/** Never auto-merged, wherever they live (package*.json, lockfiles, app.json, eas.json). */
const FORBIDDEN_BASENAME = /^(package.*\.json|npm-shrinkwrap\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|app\.json|eas\.json)$/i;
export const MAX_FILES = 5;
export const MAX_CHANGED_LINES = 80;
export const MAX_MERGED_PER_24H = 3;
export const RATE_WINDOW_HOURS = 24;
export const CHECKS_TIMEOUT_MINUTES = 25;
export const DEPLOY_TIMEOUT_MINUTES = 15;
export const LABELS = Object.freeze({ autofix: 'autofix', needsHuman: 'needs-human', revert: 'autofix-revert' });
export const PROD_BASE_URL = 'https://www.pawpi.info';
export const BRANCH_PREFIX = 'autofix/';
export const REVERT_BRANCH_PREFIX = 'autofix-revert/';

// ---------------------------------------------------------------- alert context / names
/** An alert name safe for git branch names, shell, markdown and GITHUB_OUTPUT lines. */
export function cleanAlertName(name) {
  const s = String(name ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return s || 'alert';
}
export const slugify = cleanAlertName;

/**
 * The alert context handed to the model: a manual run builds it from the inputs, a relay dispatch from client_payload.
 * Built with JSON.stringify (never string-concatenated), alertname sanitised.
 */
export function buildContext({ payload, inName, inSummary } = {}) {
  if (inName) return { alertname: cleanAlertName(inName), summary: String(inSummary ?? '').slice(0, 300), source: 'manual' };
  let obj = payload;
  if (typeof payload === 'string') {
    try { obj = JSON.parse(payload); } catch { obj = null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { alertname: 'alert', source: 'unknown' };
  // WHITELIST, not spread: whoever sent the dispatch (the relay, or anyone holding a leaked dispatch token) can only hand the
  // model an alert name, a status, a severity enum and allow-listed label values. No free text ever reaches the prompt.
  const labels = {};
  if (obj.labels && typeof obj.labels === 'object' && !Array.isArray(obj.labels)) {
    for (const k of LABEL_ALLOWLIST) {
      const v = obj.labels[k];
      if (typeof v === 'string' || typeof v === 'number') labels[k] = String(v).replace(/[^A-Za-z0-9_.\-/:@ ]/g, '_').slice(0, 80);
    }
  }
  return {
    // 'manual' is reserved for workflow_dispatch runs (inName above); a dispatch payload can never claim it.
    source: ((s) => (s === 'manual' || !s ? 'unknown' : s))(String(obj.source ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)),
    status: obj.status === 'resolved' ? 'resolved' : 'firing',
    alertname: cleanAlertName(obj.alertname),
    severity: String(obj.severity ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || 'warning',
    labels,
  };
}

/** Rule titles in observability/grafana/alerts/*.json (alert rules as code), cleaned like alert names. */
export function loadRuleNames(rootDir) {
  const dir = path.join(rootDir, 'observability', 'grafana', 'alerts');
  const names = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (typeof o.title === 'string' && ('condition' in o || 'data' in o)) names.add(cleanAlertName(o.title));
      Object.values(o).forEach(walk);
    }
  };
  let entries = [];
  try { entries = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { /* no rules dir: only the legacy names are known */ }
  for (const n of entries) {
    try { walk(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))); } catch { /* unreadable file: ignore it */ }
  }
  return [...names].sort();
}

/** Is this alert name one of the real rules (as code), a legacy live rule or a Grafana data-source alert? */
export function isKnownAlert(name, ruleNames = []) {
  const n = cleanAlertName(name);
  return LEGACY_ALERTS.map(cleanAlertName).includes(n) || ruleNames.includes(n);
}

export function isKillSwitchOn(value) {
  return String(value ?? '').trim().toLowerCase() === 'false';
}
export function isIssueOnly(alertname) {
  return ISSUE_ONLY_ALERTS.includes(String(alertname));
}

const hasLabel = (item, name) => (item?.labels ?? []).some((l) => (typeof l === 'string' ? l : l?.name) === name);

/** Branch `autofix/<slug>-<runId>` -> slug, or null. */
export function slugOfBranch(ref) {
  const m = String(ref ?? '').match(/^autofix\/(.+)-(\d+)$/);
  return m ? m[1] : null;
}

/** An OPEN PR labelled `autofix` for the same alert (exact slug match), or null. `openPrs`: [{number, headRefName, labels}]. */
export function findDuplicatePr(openPrs, slug) {
  const hit = (openPrs ?? []).find((p) => hasLabel(p, LABELS.autofix) && slugOfBranch(p.headRefName ?? p.head?.ref) === slug);
  return hit ? hit.number : null;
}

export function preflight({ alertname, kill, openPrs }) {
  const slug = cleanAlertName(alertname);
  const killed = isKillSwitchOn(kill);
  const duplicate = killed ? null : findDuplicatePr(openPrs, slug);
  return { alertname: slug, slug, killed, issueOnly: isIssueOnly(slug), duplicate, run: !killed && duplicate === null };
}

// ---------------------------------------------------------------- the merge gate
/** Is this PR the one THIS workflow run just opened (same repo, our branch, labelled, open, against main)? */
export function checkProvenance(pr, { repo, branch, number }) {
  const reasons = [];
  if (!pr || typeof pr !== 'object') return { ok: false, reasons: ['PR not found'] };
  if (pr.number !== Number(number)) reasons.push(`PR number ${pr.number} is not the one this run opened (${number})`);
  if (pr.state !== 'open') reasons.push(`PR is ${pr.state}, not open`);
  if (pr.draft) reasons.push('PR is a draft');
  if (pr.merged) reasons.push('PR is already merged');
  if (pr.head?.ref !== branch || !String(pr.head?.ref ?? '').startsWith(BRANCH_PREFIX)) reasons.push(`head branch ${pr.head?.ref} is not this run's ${branch}`);
  if (pr.head?.repo?.full_name !== repo) reasons.push('PR head is not in this repository (fork)');
  if (pr.base?.ref !== 'main') reasons.push(`PR base is ${pr.base?.ref}, not main`);
  if (!hasLabel(pr, LABELS.autofix)) reasons.push('PR does not carry the autofix label');
  return { ok: reasons.length === 0, reasons };
}

function cleanPath(p) {
  const s = String(p ?? '');
  if (!s || s.startsWith('/') || s.includes('\\') || s.includes('\0')) return null;
  return path.posix.normalize(s) === s && !s.split('/').includes('..') ? s : null;
}

/** Why one path may not be auto-merged ([] = fine). */
export function pathProblems(p) {
  const clean = cleanPath(p);
  if (!clean) return [`unsafe path "${p}"`];
  const out = [];
  const base = clean.split('/').pop();
  if (clean.startsWith('.github/')) out.push(`${clean}: CI/workflow files are human-only`);
  if (FORBIDDEN_BASENAME.test(base)) out.push(`${clean}: package/lock/app/eas config is human-only`);
  if (!ALLOWED_DIRS.some((d) => clean.startsWith(d))) out.push(`${clean}: outside the auto-merge allowlist (ALLOWED_DIRS in scripts/autofix/gate.mjs)`);
  if (SENSITIVE_PATH.test(clean)) out.push(`${clean}: touches a sensitive area (${SENSITIVE_PATH.source.replace(/\\\//g, '/')})`);
  return out;
}

/** The "+" lines of a unified-diff patch (excluding the +++ header). */
function addedLines(patch) {
  return String(patch).split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
}

/**
 * The file gate (deterministic; enforced in code, not by the model). `files` is the GitHub "list pull request files" array
 * (with `patch`). All of these must hold: 1..MAX_FILES files, <= MAX_CHANGED_LINES changed lines, every path inside ALLOWED_DIRS
 * and free of SENSITIVE_PATH words, only edits to existing files (no new/removed/renamed), no test/fixture/config files, no
 * package/lock/app/eas/CI files, and no dangerous added line.
 */
export function evaluateFiles(files) {
  const reasons = [];
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) reasons.push('PR changes no files');
  if (list.length > MAX_FILES) reasons.push(`${list.length} files changed (max ${MAX_FILES})`);
  let lines = 0;
  for (const f of list) {
    const adds = Number(f.additions) || 0;
    const dels = Number(f.deletions) || 0;
    lines += adds + dels;
    reasons.push(...pathProblems(f.filename));
    if (f.previous_filename) reasons.push(...pathProblems(f.previous_filename));
    // NO new files: only edits to files that already exist ('modified') may be auto-merged.
    if (f.status !== 'modified') reasons.push(`${f.filename}: status "${f.status}" (new, removed, renamed or copied files are human-only; only edits to existing files may be auto-merged)`);
    if (adds + dels === 0) reasons.push(`${f.filename}: no line changes (binary or mode-only change)`);
    if (TEST_PATH.test(String(f.filename ?? ''))) reasons.push(`${f.filename}: test/fixture/config file (an auto-merged fix may not edit the tests that gate it)`);
    // Deterministic content check on what the diff ADDS (no model judgement).
    if (typeof f.patch !== 'string' || f.patch === '') {
      reasons.push(`${f.filename}: GitHub returned no diff text (too large or binary), so the added lines cannot be inspected`);
    } else if (addedLines(f.patch).some((l) => DANGEROUS_ADDED_LINE.test(l))) {
      reasons.push(`${f.filename}: the diff adds an import/require, env/process/network/fs/exec call, URL or SQL DDL/RLS statement (human-only)`);
    }
  }
  if (lines > MAX_CHANGED_LINES) reasons.push(`${lines} changed lines (max ${MAX_CHANGED_LINES})`);
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], files: list.length, lines };
}

/**
 * True only when /tmp/incident.md carries the line `CONFIDENCE: high` and no other CONFIDENCE line says anything else.
 * Exact text on its own line (surrounding whitespace ignored): decorated or hedged variants do NOT count.
 */
export function isHighConfidence(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^confidence\s*:/i.test(l));
  return lines.length > 0 && lines.every((l) => l === 'CONFIDENCE: high');
}

/** Rate limit: at most MAX_MERGED_PER_24H autofix PRs merged in the window; any merged autofix REVERT in the window stops auto-merge too. */
export function rateLimit({ mergedPrs, now = new Date() }) {
  const cutoff = new Date(now).getTime() - RATE_WINDOW_HOURS * 3600 * 1000;
  const recent = (mergedPrs ?? []).filter((p) => p?.mergedAt && new Date(p.mergedAt).getTime() >= cutoff);
  const fixes = recent.filter((p) => hasLabel(p, LABELS.autofix) && !hasLabel(p, LABELS.revert));
  const reverts = recent.filter((p) => hasLabel(p, LABELS.revert));
  if (reverts.length) return { blocked: true, count: fixes.length, reason: `an autofix revert was merged in the last ${RATE_WINDOW_HOURS}h (#${reverts[0].number}): auto-merge is paused until a human looks` };
  if (fixes.length >= MAX_MERGED_PER_24H) return { blocked: true, count: fixes.length, reason: `${fixes.length} autofix PRs already merged in the last ${RATE_WINDOW_HOURS}h (max ${MAX_MERGED_PER_24H})` };
  return { blocked: false, count: fixes.length, reason: '' };
}

/**
 * State of the three required checks on `sha` from the REST check-runs list.
 *   failed  = a required check finished with anything but success (fail fast)
 *   success = all required checks exist, are completed and succeeded
 *   pending = otherwise (missing / queued / in progress)
 * When a check was re-run, the newest run wins. Runs for another sha are ignored.
 */
export function evaluateChecks(checkRuns, sha) {
  const runs = (Array.isArray(checkRuns) ? checkRuns : []).filter((r) => !sha || !r.head_sha || r.head_sha === sha);
  const details = {};
  for (const name of REQUIRED_CHECKS) {
    const mine = runs.filter((r) => r.name === name).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    const r = mine[0];
    if (!r) details[name] = 'missing';
    else if (r.status !== 'completed') details[name] = 'pending';
    else details[name] = r.conclusion === 'success' ? 'success' : `failed (${r.conclusion})`;
  }
  const vals = Object.values(details);
  const state = vals.some((v) => v.startsWith('failed')) ? 'failed' : vals.every((v) => v === 'success') ? 'success' : 'pending';
  return { state, details };
}

// ---------------------------------------------------------------- deploy verification
export function shortSha(sha) {
  const s = String(sha ?? '').trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(s) ? s.slice(0, 7) : null;
}

/** `/api/health/deep` body (object or JSON text) must say ok:true AND report the merged commit's short sha as version. */
export function verifyHealth(body, wantShort) {
  let b = body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { return { ok: false, reason: 'not JSON' }; }
  }
  if (!b || typeof b !== 'object') return { ok: false, reason: 'no body' };
  if (b.ok !== true) return { ok: false, reason: 'ok is not true' };
  if (b.version !== wantShort) return { ok: false, reason: `version ${b.version} != ${wantShort} (old deploy still serving)` };
  return { ok: true, reason: '' };
}

/** Grafana annotation for a revert (POST /api/annotations). */
export function buildAnnotation({ text, tags = [], now = Date.now() }) {
  return { time: now, tags: ['pawpi', 'autofix', ...tags], text: String(text).slice(0, 500) };
}

// ---------------------------------------------------------------- CLI
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument "${a}"`);
    flags[a.slice(2)] = argv[i + 1] ?? '';
    i++;
  }
  return flags;
}
const readStdin = () => fs.readFileSync(0, 'utf8');
const readJson = () => {
  const t = readStdin().trim();
  return t ? JSON.parse(t) : null;
};

export function runCli(argv, env = process.env) {
  const [cmd, ...rest] = argv;
  const f = parseFlags(rest);
  switch (cmd) {
    case 'context': return buildContext({ payload: env.PAYLOAD, inName: env.IN_NAME, inSummary: env.IN_SUMMARY });
    case 'preflight': { const i = readJson() ?? {}; return preflight({ alertname: i.alertname, kill: f.kill, openPrs: i.openPrs }); }
    case 'provenance': return checkProvenance(readJson(), { repo: f.repo, branch: f.branch, number: f.number });
    case 'files': return evaluateFiles(readJson());
    case 'confidence': return { high: isHighConfidence(readStdin()) };
    case 'ratelimit': return rateLimit({ mergedPrs: readJson(), now: f.now ? new Date(f.now) : new Date() });
    case 'checks': return evaluateChecks(readJson(), f.sha);
    case 'health': return verifyHealth(readStdin().trim() || null, f.sha);
    case 'annotation': return buildAnnotation({ text: f.text, tags: f.tags ? f.tags.split(',') : [] });
    case 'known': return { known: isKnownAlert(f.name, loadRuleNames(f.root || '.')) };
    case 'slug': return { slug: cleanAlertName(f.name) };
    default: throw new Error(`unknown command "${cmd}"`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.stdout.write(`${JSON.stringify(runCli(process.argv.slice(2)))}\n`);
  } catch (e) {
    process.stderr.write(`gate.mjs: ${e.message}\n`);
    process.exit(2);
  }
}
