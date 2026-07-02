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
    const entries = Object.entries(bundled).sort((a, b) => b[0].length - a[0].length);
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
    .sort((a, b) => {
      return b.length - a.length;
    });

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
