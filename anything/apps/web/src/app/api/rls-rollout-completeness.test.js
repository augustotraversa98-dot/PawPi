import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// RLS R1-rollout completeness guard (docs/rls-hardening.md).
//
// Every API route that touches the DB must run its handlers through
// withRequestContext so `app.current_user_id` is set for the request. The
// rollout converts each route from the bare form
//     export async function GET(...) { ... }
// to the wrapped form
//     async function GET(...) { ... }
//     export { wrappedGET as GET };   // wrappedGET = withRequestContext(GET)
//
// This static source scan FAILS if any route.js still exports a handler the
// bare way, UNLESS the file is on the documented allowlist below. That both
// proves the rollout is complete now AND stops a future un-wrapped route from
// silently regressing it (at R3, an unwrapped route would hit a FORCE-RLS'd
// table with no identity and return zero rows).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = __dirname; // this file lives at src/app/api/

// Intentionally NOT wrapped. These routes do not issue any `sql` query, so a
// request-scoped identity transaction would be pure overhead with nothing to
// protect. Auth-adjacent routes additionally must run OUTSIDE the identity
// wrapper. Keep this list minimal and justified — adding a DB-touching route
// here defeats the guard.
const ALLOWLIST = new Set([
  'auth/token/route.js', // mints the Expo session JWT; no DB, runs around auth
  'auth/expo-web-success/route.js', // off-platform auth bridge; no DB
  'upload/route.js', // proxies bytes to Supabase Storage; no DB
  '__create/ssr-test/route.js', // scaffolding SSR probe; no DB
  '__create/check-social-secrets/route.js', // env-var diagnostic; no DB
]);

const BARE_EXPORT_RE =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/;

function findRouteFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry.name === 'route.js') {
      out.push(full);
    }
  }
  return out;
}

describe('RLS R1-rollout completeness', () => {
  const routeFiles = findRouteFiles(API_ROOT);

  it('finds the API route tree', () => {
    // Guards against a wrong API_ROOT silently passing the scan with zero files.
    expect(routeFiles.length).toBeGreaterThan(50);
  });

  it('every DB-touching route wraps its handlers with withRequestContext', () => {
    const offenders = [];
    for (const file of routeFiles) {
      const rel = path.relative(API_ROOT, file).split(path.sep).join('/');
      if (ALLOWLIST.has(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (BARE_EXPORT_RE.test(src)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `These routes still export handlers the bare way (wrap them with ` +
        `withRequestContext, or add to the documented allowlist if they touch ` +
        `no DB):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('every allowlisted route exists and genuinely touches no DB', () => {
    for (const rel of ALLOWLIST) {
      const file = path.join(API_ROOT, ...rel.split('/'));
      expect(fs.existsSync(file), `allowlisted route missing: ${rel}`).toBe(
        true,
      );
      const src = fs.readFileSync(file, 'utf8');
      // The justification for skipping is "no sql" — enforce it so a future
      // edit that adds a query to an allowlisted route trips this guard.
      expect(
        /utils\/sql/.test(src),
        `allowlisted route now imports sql — wrap it instead: ${rel}`,
      ).toBe(false);
    }
  });
});
