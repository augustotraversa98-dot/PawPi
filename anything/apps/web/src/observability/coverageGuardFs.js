// Disk loader for the coverage guard (coverageGuard.js stays pure). Node only. Everything is relative to a repo root, so the
// tests can point it at a temp-dir fixture that has the same layout as the real repo:
//   <root>/anything/apps/web/src/app/api/**          server routes
//   <root>/anything/apps/web/src/lib/telemetry/registry.js
//   <root>/anything/apps/mobile/src/app/**           mobile screens
//   <root>/anything/apps/mobile/src/**               mobile sources (funnel emission scan)
//   <root>/anything/apps/mobile/src/telemetry/registry.js
//   <root>/observability/grafana/{dashboards,alerts}/*.json
//   <root>/docs/observability/night-run/01-TELEMETRY-CONTRACT.md

import fs from 'node:fs';
import path from 'node:path';
import { parseContract } from './dashboardLint.js';

const SOURCE_RE = /\.(js|jsx|ts|tsx)$/;

function listFiles(dir, { skipDirs = ['node_modules'] } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!skipDirs.includes(e.name)) walk(path.join(d, e.name), r);
      } else out.push(r);
    }
  })(dir, '');
  return out.sort();
}

/**
 * Read `{SCREENS, FUNNELS, EVENT_NAMES}` out of a registry file. The registry is plain data with `export const` only and no imports
 * (a registry test enforces that), so it is evaluated in isolation: works for any path, including fixtures.
 */
export function readRegistry(file) {
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8').replace(/^\s*export\s+(const|function)\s/gm, '$1 ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { SCREENS, FUNNELS, EVENT_NAMES };`)();
}

function readJsonDir(dir) {
  return listFiles(dir)
    .filter((f) => f.endsWith('.json') && !f.includes('/'))
    .map((file) => ({ file, json: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) }));
}

/** Build the input for runCoverageGuard from a repo checkout (or fixture) rooted at `repoRoot`. */
export function loadGuardInput(repoRoot) {
  const web = path.join(repoRoot, 'anything/apps/web');
  const mobile = path.join(repoRoot, 'anything/apps/mobile');
  const contractMarkdown = fs.readFileSync(path.join(repoRoot, 'docs/observability/night-run/01-TELEMETRY-CONTRACT.md'), 'utf8');
  const webRegistryPath = path.join(web, 'src/lib/telemetry/registry.js');
  const mobileRegistryPath = path.join(mobile, 'src/telemetry/registry.js');

  const webRegistry = readRegistry(webRegistryPath);
  const mobileSrc = path.join(mobile, 'src');
  const mobileSources = listFiles(mobileSrc)
    .filter(
      (rel) =>
        SOURCE_RE.test(rel) &&
        !/\.test\./.test(rel) &&
        rel !== 'telemetry/registry.js' &&
        rel !== 'telemetry/testKit.js'
    )
    .map((rel) => ({ file: `mobile src/${rel}`, text: fs.readFileSync(path.join(mobileSrc, rel), 'utf8') }));

  return {
    apiRouteFiles: listFiles(path.join(web, 'src/app/api')),
    mobileFiles: listFiles(path.join(mobile, 'src/app')),
    webRegistry,
    mobileRegistry: readRegistry(mobileRegistryPath),
    mobileSources,
    contractMarkdown,
    contract: parseContract(contractMarkdown),
    eventNames: webRegistry?.EVENT_NAMES ?? null,
    dashboards: readJsonDir(path.join(repoRoot, 'observability/grafana/dashboards')).map(({ file, json }) => ({ file, dashboard: json })),
    alerts: readJsonDir(path.join(repoRoot, 'observability/grafana/alerts')).map(({ file, json }) => ({ file, doc: json })),
  };
}
