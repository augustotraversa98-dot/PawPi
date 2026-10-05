// Plain 404 for the paths vulnerability scanners probe (/.env, /.git/config, /Dockerfile, /docker-compose.yml,
// /core/.env, /wp-login.php, /phpmyadmin, backup.sql, index.php.bak, config~ ...).
//
// Why: none of these exist, but the React Router catch-all route ('*?' -> __create/not-found.tsx) answers every
// unknown path with HTTP 200 + app HTML, which tells a scanner "something is here" and invites more probing.
//
// Registered in __create/index.ts BEFORE the static-file and React Router handlers (createHonoServer adds those after
// our app's middleware), so everything real must pass through untouched. The rule is deliberately a DENY-list of
// obviously irrelevant shapes, never an allow-list of real routes: a new page or asset must keep working without
// editing this file. Specifically left alone:
//   - /api/*            real routes; unknown ones already get a JSON 404 from apiNotFound.js
//   - /.well-known/*    (e.g. apple-app-site-association) — the one dotted top-level segment we allow
//   - /assets/*, /robots.txt, /sitemap.xml and every real page route (privacy, terms, support, eula, p/..., ...)
//
// The response is a fixed body: nothing from the request (path, query, headers) is echoed back, logged or stored here.
export const PROBE_NOT_FOUND_BODY = 'Not Found';

const PHP_SQL_BAK = /\.(?:php\d?|phtml|sql|bak)$/;
const DOCKER = /^(?:dockerfile(?:\..*)?|docker-compose.*)$/;
const WORDPRESS = /^wp-/;
const PHPMYADMIN = /^phpmyadmin/;

function decodeLoose(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // malformed %-escape: judge the raw text
  }
}

// `pathname` is the URL path only (no query/hash), e.g. c.req.path.
export function isProbePath(pathname) {
  if (typeof pathname !== 'string') return false;
  // Real API routes are never judged here (see header).
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;

  // Lowercase + decode each segment so /%2Eenv, /.ENV and /DOCKERFILE can't slip past an exact-case match.
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((s) => decodeLoose(s).toLowerCase());
  if (segments.length === 0) return false; // "/"

  // Anything under /.well-known/ is exempt, as is anything an exempt path nests below it.
  if (segments[0] === '.well-known') return false;

  // Any dotfile / dot-directory segment: /.env, /.env.local, /.git/config, /app/.aws/credentials ...
  if (segments.some((s) => s.startsWith('.'))) return true;

  const first = segments[0];
  const last = segments[segments.length - 1];

  // Editor/backup leftovers: /.env~ (also caught above), /config.js~, /index.html~
  if (last.endsWith('~')) return true;

  if (first === 'core') return true; // /core, /core/.env, /core/anything
  if (WORDPRESS.test(first)) return true; // /wp-admin, /wp-login.php, /wp-content/...
  if (PHPMYADMIN.test(first)) return true;
  if (DOCKER.test(first)) return true; // /Dockerfile, /docker-compose.yml, /docker-compose.override.yaml
  if (PHP_SQL_BAK.test(last)) return true; // /x.php, /dump.sql, /site.bak anywhere in the path

  return false;
}

export function probeNotFound(c) {
  return c.text(PROBE_NOT_FOUND_BODY, 404);
}

// Hono middleware: 404 for probe paths, otherwise hand straight on. Pure string check; no I/O, no logging.
export function blockProbePaths() {
  return (c, next) => (isProbePath(c.req.path) ? probeNotFound(c) : next());
}
