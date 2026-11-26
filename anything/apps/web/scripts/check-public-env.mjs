// Post-build check for NEXT_PUBLIC_* values.
//
// NEXT_PUBLIC_* values are not read at runtime in the browser: plugins/nextPublicProcessEnv.ts
// inlines them into the client bundle at BUILD time, using whatever the build process could see
// (process.env + .env files). Two things can therefore go quietly wrong in a deploy:
//   1. the value was never set on the build (so the feature that needs it silently degrades), or
//   2. the value was set but the build never saw it, or the inlining step stopped working.
// Both look identical in the browser. This script runs after `react-router build` and says which
// it is, in the build log.
//
//   - EXPECTED_PUBLIC_ENV lists vars a production feature needs. Unset => WARNING (never fails the
//     build: every one of them is optional by design and degrades cleanly).
//   - A var that IS set (non-empty) but whose value cannot be found in build/client => ERROR and a
//     non-zero exit, because that means the inlining step itself is broken.
// Only names are printed, never values.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

// Vars a production feature depends on, with what breaks when they are missing.
export const EXPECTED_PUBLIC_ENV = {
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY:
    'the provider location map picker will not render (manual lat/lng inputs only)',
};

/** Public env as the build sees it. Mirrors plugins/nextPublicProcessEnv.ts exactly. */
export function loadPublicEnv(cwd = process.cwd()) {
  return loadEnv(process.env.NODE_ENV ?? 'production', cwd, 'NEXT_PUBLIC_');
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.[cm]?js$/.test(name)) yield p;
  }
}

export function readClientBundle(clientDir) {
  let out = '';
  for (const f of walk(clientDir)) out += readFileSync(f, 'utf8') + '\n';
  return out;
}

/**
 * Pure core, unit-tested. Returns { present, missingFromBundle, unsetExpected }.
 *  - present:           set vars whose value is in the bundle
 *  - missingFromBundle: set vars whose value is NOT in the bundle (inlining is broken)
 *  - unsetExpected:     EXPECTED_PUBLIC_ENV names that are not set/non-empty on this build
 */
export function checkPublicEnv(publicEnv, bundleText, expected = EXPECTED_PUBLIC_ENV) {
  const present = [];
  const missingFromBundle = [];
  for (const [name, value] of Object.entries(publicEnv)) {
    if (value === undefined || value === '') continue;
    // The bundle is minified JS, so the value is embedded as a JSON-ish string literal.
    const escaped = JSON.stringify(value).slice(1, -1);
    if (bundleText.includes(value) || bundleText.includes(escaped)) present.push(name);
    else missingFromBundle.push(name);
  }
  const unsetExpected = Object.keys(expected).filter((n) => !publicEnv[n]);
  return { present, missingFromBundle, unsetExpected };
}

export function run({ cwd = process.cwd(), log = console } = {}) {
  const clientDir = path.join(cwd, 'build', 'client');
  const publicEnv = loadPublicEnv(cwd);
  const result = checkPublicEnv(publicEnv, readClientBundle(clientDir));
  const names = Object.keys(publicEnv).filter((n) => publicEnv[n] !== '');

  log.log(
    `[public-env] build saw ${names.length} NEXT_PUBLIC_* var(s): ${names.join(', ') || '(none)'}`,
  );
  for (const n of result.unsetExpected) {
    log.warn(
      `[public-env] WARNING ${n} is not set on this build: ${EXPECTED_PUBLIC_ENV[n]}. ` +
        'It is inlined at build time, so set it on the build environment and redeploy.',
    );
  }
  for (const n of result.missingFromBundle) {
    log.error(
      `[public-env] ERROR ${n} is set but its value is not in the client bundle: ` +
        'the inlining step (plugins/nextPublicProcessEnv.ts) is not working.',
    );
  }
  return result.missingFromBundle.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(run());
}
