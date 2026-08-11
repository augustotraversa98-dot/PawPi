import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { Handler } from 'hono/types';
import updatedFetch from '../src/__create/fetch';

const API_BASENAME = '/api';
const api = new Hono();

// Get current directory
const __dirname = join(fileURLToPath(new URL('.', import.meta.url)), '../src/app/api');
if (globalThis.fetch) {
  globalThis.fetch = updatedFetch;
}

// Recursively find all route.js files
async function findRouteFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  let routes: string[] = [];

  for (const file of files) {
    try {
      const filePath = join(dir, file);
      const statResult = await stat(filePath);

      if (statResult.isDirectory()) {
        routes = routes.concat(await findRouteFiles(filePath));
      } else if (file === 'route.js') {
        // Handle root route.js specially
        if (filePath === join(__dirname, 'route.js')) {
          routes.unshift(filePath); // Add to beginning of array
        } else {
          routes.push(filePath);
        }
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }

  return routes;
}

// Registration ORDER matters. This app's SmartRouter falls back to TrieRouter (some API paths
// make RegExpRouter throw UnsupportedPathError), and TrieRouter is registration-order sensitive
// where a STATIC segment overlaps a [param] sibling (e.g. /services/reorder vs
// /services/[serviceId]). The old rule sorted by path-string LENGTH descending — but
// "[serviceId]" (11) is longer than "reorder" (7), so the dynamic route registered first and
// SHADOWED the static one, making PATCH /services/reorder 500 ("invalid integer: reorder").
//
// Sort by SPECIFICITY instead: at the first differing segment a static outranks a [param], which
// outranks a [...catchAll], so the static route always registers (and therefore matches) first.
function segmentRank(segment: string): number {
  if (/^\[\.{3}.+\]$/.test(segment)) return 2; // [...catchAll]
  if (/^\[.+\]$/.test(segment)) return 1; // [param]
  return 0; // static literal
}

function routeSegments(pathLike: string): string[] {
  return pathLike
    .replace(/\/route\.js$/, '')
    .split('/')
    .filter(Boolean);
}

// Comparator: more specific (static-first) routes sort earlier. Negative → `a` registers first.
// Works on either a dev absolute file path or a prod glob key — the shared static prefix segments
// compare equal, so ranking is decided at the segment where two routes actually diverge.
function compareRouteSpecificity(a: string, b: string): number {
  const sa = routeSegments(a);
  const sb = routeSegments(b);
  const shared = Math.min(sa.length, sb.length);
  for (let i = 0; i < shared; i++) {
    const diff = segmentRank(sa[i]) - segmentRank(sb[i]);
    if (diff !== 0) return diff; // static(0) before param(1) before catch-all(2)
  }
  if (sa.length !== sb.length) return sb.length - sa.length; // deeper path first
  return a < b ? -1 : a > b ? 1 : 0; // stable, deterministic
}

// Helper function to transform a path relative to the api root ("/pets/[id]/route.js")
// into a Hono route path
function getHonoPath(relativePath: string): { name: string; pattern: string }[] {
  const parts = relativePath.split('/').filter(Boolean);
  const routeParts = parts.slice(0, -1); // Remove 'route.js'
  if (routeParts.length === 0) {
    return [{ name: 'root', pattern: '' }];
  }
  const transformedParts = routeParts.map((segment) => {
    const match = segment.match(/^\[(\.{3})?([^\]]+)\]$/);
    if (match) {
      const [_, dots, param] = match;
      return dots === '...'
        ? { name: param, pattern: `:${param}{.+}` }
        : { name: param, pattern: `:${param}` };
    }
    return { name: segment, pattern: segment };
  });
  return transformedParts;
}

// Register one imported route module. `devRouteFile` (dev only) is the absolute
// file path used to re-import the module fresh on every request for hot reload.
function registerRouteModule(
  relativePath: string,
  route: Record<string, Handler>,
  devRouteFile?: string
) {
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  for (const method of methods) {
    try {
      if (route[method]) {
        const parts = getHonoPath(relativePath);
        const honoPath = `/${parts.map(({ pattern }) => pattern).join('/')}`;
        const handler: Handler = async (c) => {
          const params = c.req.param();
          if (import.meta.env.DEV && devRouteFile) {
            const updatedRoute = await import(
              /* @vite-ignore */ `${devRouteFile}?update=${Date.now()}`
            );
            return await updatedRoute[method](c.req.raw, { params });
          }
          return await route[method](c.req.raw, { params });
        };
        const methodLowercase = method.toLowerCase();
        switch (methodLowercase) {
          case 'get':
            api.get(honoPath, handler);
            break;
          case 'post':
            api.post(honoPath, handler);
            break;
          case 'put':
            api.put(honoPath, handler);
            break;
          case 'delete':
            api.delete(honoPath, handler);
            break;
          case 'patch':
            api.patch(honoPath, handler);
            break;
          default:
            console.warn(`Unsupported method: ${method}`);
            break;
        }
      }
    } catch (error) {
      console.error(`Error registering route ${relativePath} for method ${method}:`, error);
    }
  }
}

// Import and register all routes
async function registerRoutes() {
  // Clear existing routes
  api.routes = [];

  if (!import.meta.env.DEV) {
    // Production: the filesystem scan below can't work — src/ isn't shipped and
    // the @vite-ignore dynamic imports are never bundled. import.meta.glob is
    // statically analyzable, so Vite compiles every route.js (with aliases
    // resolved) into the server bundle, keeping it self-contained.
    const bundled = import.meta.glob('../src/app/api/**/route.js', { eager: true }) as Record<
      string,
      Record<string, Handler>
    >;
    const entries = Object.entries(bundled).sort((a, b) => compareRouteSpecificity(a[0], b[0]));
    for (const [globKey, route] of entries) {
      registerRouteModule(globKey.replace('../src/app/api', ''), route);
    }
    return;
  }

  const routeFiles = (
    await findRouteFiles(__dirname).catch((error) => {
      console.error('Error finding route files:', error);
      return [];
    })
  )
    .slice()
    .sort(compareRouteSpecificity);

  for (const routeFile of routeFiles) {
    try {
      const route = await import(/* @vite-ignore */ `${routeFile}?update=${Date.now()}`);
      registerRouteModule(routeFile.replace(__dirname, ''), route, routeFile);
    } catch (error) {
      console.error(`Error importing route file ${routeFile}:`, error);
    }
  }
}

// Initial route registration
await registerRoutes();

// Hot reload routes in development
if (import.meta.env.DEV) {
  import.meta.glob('../src/app/api/**/route.js', {
    eager: true,
  });
  if (import.meta.hot) {
    import.meta.hot.accept((newSelf) => {
      registerRoutes().catch((err) => {
        console.error('Error reloading routes:', err);
      });
    });
  }
}

export { api, API_BASENAME };
