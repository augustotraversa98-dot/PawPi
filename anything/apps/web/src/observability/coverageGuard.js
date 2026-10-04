// "Nothing is unmonitored" coverage guard (night-run Step E). PURE core: everything is passed in as data (file listings, file
// texts, parsed JSON), so it can be tested with in-memory or temp-dir fixtures; the disk loader lives in coverageGuardFs.js and
// the vitest entry point in coverageGuard.test.js. No network.
//
// Four checks; every failure names the offender and says what to do:
//   (a) every route file under src/app/api maps to a telemetry `area` (areaForPath !== 'other') unless its top-level directory is
//       allow-listed here WITH a reason                                          -> fix: src/lib/telemetry/areas.js
//   (b) every mobile screen file under mobile src/app has an entry in BOTH registries (web + mobile mirror)
//                                                                                -> fix: web registry.js, then copy it verbatim to mobile
//   (c) every funnel step in the contract / either registry is emitted somewhere in mobile code (literal
//       trackFunnel("funnel", "step") call, same approach as mobile funnelCoverage.test.js) and every call names a real pair
//   (d) dashboards + alert rules reference only contract names (the Step C/D lint functions, re-used as-is), and every JSON field a
//       job="pawpi-web" dashboard query extracts exists in the server log line schema (serverLogs.js LOG_FIELDS)

import { areaForPath as defaultAreaForPath } from '../lib/telemetry/areas.js';
import { LOG_FIELDS } from '../lib/telemetry/serverLogs.js';
import { lintAll } from './dashboardLint.js';
import { lintAlerts } from './alertLint.js';

/** Top-level /api directories that are deliberately area "other", each with the reason. Single source (areas.test.js uses it too). */
export const ALLOWED_OTHER_API_DIRS = Object.freeze({
  upload: 'generic file-upload proxy; belongs to no single feature',
  __create: 'platform scaffolding probes (ssr-test, check-social-secrets)',
});

// ---------------------------------------------------------------- shared derivations
/** Mobile file under src/app -> screen template (the documented rule in registry.js). Same rule as the registry tests. */
export function screenForFile(rel) {
  const segs = String(rel)
    .replace(/\.(jsx|tsx|js|ts)$/, '')
    .split('/')
    .filter((s) => !/^\(.*\)$/.test(s)); // drop (group) segments
  if (segs[segs.length - 1] === 'index') segs.pop();
  return '/' + segs.map((s) => (/^\[.*\]$/.test(s) ? ':id' : s)).join('/');
}

/** Is this file (relative to mobile src/app) a screen? Layouts, tests, docs and the tabsConfig helper are not. */
export function isScreenFile(rel) {
  const name = String(rel).split('/').pop();
  return (
    /\.(jsx|tsx|js|ts)$/.test(name) &&
    !/\.test\./.test(name) &&
    !/^_layout\./.test(name) &&
    rel !== '(tabs)/tabsConfig.js'
  );
}

/** Is this a server route file (relative to src/app/api)? */
export function isApiRouteFile(rel) {
  return /(^|\/)route\.(js|ts)$/.test(String(rel));
}

/** `pets/[id]/profile/route.js` -> `/api/pets/[id]/profile` (parameters stay spelled `[id]`; areaForPath only looks at segments). */
export function apiPathForRouteFile(rel) {
  const dir = String(rel).replace(/(^|\/)route\.(js|ts)$/, '');
  return '/api' + (dir ? '/' + dir : '');
}

/** Funnels of the contract markdown: the "## Named funnels" bullets `- name: step, step`. -> { name: [steps] }. */
export function parseContractFunnels(markdown) {
  const out = {};
  let inSection = false;
  for (const line of String(markdown).split('\n')) {
    if (/^##\s/.test(line)) inSection = /^##\s+Named funnels/i.test(line);
    if (!inSection) continue;
    const m = line.match(/^-\s+([a-z_]+):\s+([a-z_,\s]+?)\s*$/);
    if (!m || /retention/i.test(m[1])) continue;
    out[m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/** Drop comment-only lines and block comments that start a line, so a commented-out call does not count as an emission. */
export function stripComments(text) {
  return String(text)
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const TRACK_FUNNEL_RE = /trackFunnel\(\s*["']([a-z_]+)["']\s*,\s*["']([a-z_]+)["']/g;

/** Every literal trackFunnel("funnel","step") call in one source text. */
export function findFunnelCalls(text) {
  const calls = [];
  const src = stripComments(text);
  TRACK_FUNNEL_RE.lastIndex = 0;
  let m;
  while ((m = TRACK_FUNNEL_RE.exec(src))) calls.push({ funnel: m[1], step: m[2] });
  return calls;
}

/** Every (query-string-free) `expr` of a dashboard with the panel title it belongs to. */
function dashboardExprs(dashboard) {
  const out = [];
  (function walk(node, title) {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, title));
    if (!node || typeof node !== 'object') return;
    const t = typeof node.title === 'string' ? node.title : title;
    if (typeof node.expr === 'string') out.push({ panel: t, expr: node.expr });
    for (const v of Object.values(node)) walk(v, t);
  })(dashboard, '(dashboard)');
  return out;
}

/** JSON fields a LogQL expression extracts (`| json a="x", b="y"` -> x, y; `| unwrap f` -> f). */
export function lokiJsonFields(expr) {
  const fields = [];
  for (const m of String(expr).matchAll(/\|\s*json\b([^|]*)/g)) {
    for (const f of m[1].matchAll(/=\s*"([^"]+)"/g)) fields.push(f[1]);
  }
  for (const m of String(expr).matchAll(/\|\s*unwrap\s+(?:\w+\()?([A-Za-z_][A-Za-z0-9_]*)/g)) fields.push(m[1]);
  return fields;
}

// ---------------------------------------------------------------- the guard
/**
 * @typedef {{check: 'a'|'b'|'c'|'d', offender: string, message: string}} Failure
 * @param {object} input
 * @param {string[]} input.apiRouteFiles    paths relative to src/app/api (any file; non-route files are ignored)
 * @param {string[]} input.mobileFiles      paths relative to mobile src/app (any file; non-screens are ignored)
 * @param {{SCREENS: string[], FUNNELS: Record<string,string[]>}} input.webRegistry
 * @param {{SCREENS: string[], FUNNELS: Record<string,string[]>} | null} input.mobileRegistry
 * @param {Array<{file: string, text: string}>} input.mobileSources  mobile src files (tests + registry already excluded)
 * @param {string} input.contractMarkdown
 * @param {Map} input.contract              parseContract(contractMarkdown)
 * @param {string[]} input.eventNames
 * @param {Array<{file: string, dashboard: object}>} input.dashboards
 * @param {Array<{file: string, doc: object}>} input.alerts
 * @param {(p: string) => string} [input.areaForPath]
 * @param {Record<string,string>} [input.allowOtherApiDirs]
 * @returns {Failure[]}
 */
export function runCoverageGuard(input) {
  const {
    apiRouteFiles = [],
    mobileFiles = [],
    webRegistry,
    mobileRegistry = null,
    mobileSources = [],
    contractMarkdown = '',
    contract,
    eventNames = null,
    dashboards = [],
    alerts = [],
    areaForPath = defaultAreaForPath,
    allowOtherApiDirs = ALLOWED_OTHER_API_DIRS,
  } = input;
  /** @type {Failure[]} */
  const failures = [];
  const fail = (check, offender, message) => failures.push({ check, offender, message });

  // (a) API routes -> area
  for (const rel of apiRouteFiles.filter(isApiRouteFile)) {
    const apiPath = apiPathForRouteFile(rel);
    const top = apiPath.split('/')[2] ?? '';
    const area = areaForPath(apiPath);
    if (area === 'other' && !Object.prototype.hasOwnProperty.call(allowOtherApiDirs, top)) {
      fail(
        'a',
        `src/app/api/${rel}`,
        `route ${apiPath} maps to area "other": add "${top || '(root)'}" to TOP_LEVEL_AREA in src/lib/telemetry/areas.js ` +
          `(or allow-list it with a reason in ALLOWED_OTHER_API_DIRS, src/observability/coverageGuard.js)`
      );
    }
  }

  // (b) mobile screens -> both registries
  const screens = mobileFiles.filter(isScreenFile).map((rel) => ({ rel, screen: screenForFile(rel) }));
  for (const { rel, screen } of screens) {
    if (!webRegistry?.SCREENS?.includes(screen)) {
      fail('b', `mobile src/app/${rel}`, `screen ${screen} is missing from the WEB registry SCREENS (src/lib/telemetry/registry.js); add it there first`);
    }
    if (!mobileRegistry) {
      fail('b', `mobile src/app/${rel}`, 'mobile registry (mobile src/telemetry/registry.js) could not be loaded');
    } else if (!mobileRegistry.SCREENS?.includes(screen)) {
      fail('b', `mobile src/app/${rel}`, `screen ${screen} is missing from the MOBILE registry mirror; copy src/lib/telemetry/registry.js over mobile src/telemetry/registry.js verbatim`);
    }
  }

  // (c) funnel steps -> emitted in mobile code
  const pairs = new Map(); // "funnel/step" -> where it is defined
  const addPairs = (funnels, where) => {
    for (const [funnel, steps] of Object.entries(funnels ?? {})) for (const step of steps) if (!pairs.has(`${funnel}/${step}`)) pairs.set(`${funnel}/${step}`, where);
  };
  addPairs(parseContractFunnels(contractMarkdown), 'the contract (01-TELEMETRY-CONTRACT.md)');
  addPairs(webRegistry?.FUNNELS, 'the web registry');
  addPairs(mobileRegistry?.FUNNELS, 'the mobile registry');
  const emitted = new Set();
  for (const { file, text } of mobileSources) {
    for (const { funnel, step } of findFunnelCalls(text)) {
      emitted.add(`${funnel}/${step}`);
      if (!pairs.has(`${funnel}/${step}`)) {
        fail('c', `${file}`, `trackFunnel("${funnel}", "${step}") is not a funnel step in the contract/registry (typo, or add it to the contract + registry first)`);
      }
    }
  }
  for (const [pair, where] of pairs) {
    if (!emitted.has(pair)) {
      const [funnel, step] = pair.split('/');
      fail('c', `funnel step ${pair}`, `defined in ${where} but no trackFunnel("${funnel}", "${step}") call exists in mobile src (emit it, or remove the step everywhere)`);
    }
  }
  for (const [funnel, steps] of Object.entries(parseContractFunnels(contractMarkdown))) {
    for (const step of steps) {
      if (!webRegistry?.FUNNELS?.[funnel]?.includes(step)) fail('c', `funnel step ${funnel}/${step}`, 'in the contract but not in the web registry FUNNELS');
    }
  }

  // (d) dashboards + alerts -> contract names only
  for (const e of lintAll(dashboards, { contract, eventNames })) fail('d', 'dashboard', e);
  for (const e of lintAlerts(alerts, { contract })) fail('d', 'alert', e);
  for (const { file, dashboard } of dashboards) {
    for (const { panel, expr } of dashboardExprs(dashboard)) {
      if (!/job\s*=\s*"pawpi-web"/.test(expr)) continue;
      for (const field of lokiJsonFields(expr)) {
        if (!LOG_FIELDS.includes(field)) {
          fail('d', `[${file}] panel "${panel}"`, `reads job="pawpi-web" field "${field}" which is not in the server log schema (${LOG_FIELDS.join(', ')}; src/lib/telemetry/serverLogs.js)`);
        }
      }
    }
  }

  return failures;
}

/** One human-readable line per failure: "(c) funnel step a/b: message". */
export function formatFailures(failures) {
  return failures.map((f) => `(${f.check}) ${f.offender}: ${f.message}`);
}
