// @vitest-environment node
// Every inline <script> the server writes must carry the request's CSP nonce, or the browser
// refuses to run it (src/app/api/utils/securityHeaders.js).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Suspense, useContext } from 'react';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import {
  Outlet,
  Scripts,
  ScrollRestoration,
  createStaticHandler,
} from 'react-router';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { GET as expoWebSuccess } from './api/auth/expo-web-success/route';
import { GET as mobileStart } from './api/auth/mobile-start/route';
import { securityHeaders } from './api/utils/securityHeaders';
import handleRequest from './entry.server';
import { NonceContext } from '@/lib/csp/NonceContext';

vi.mock('@auth/core/jwt', () => ({ getToken: vi.fn(async () => null) }));

afterEach(() => {
  vi.restoreAllMocks();
});

const serve = (handler) => {
  const app = new Hono();
  app.use(contextStorage());
  app.use('*', securityHeaders());
  app.get('*', (c) => handler(c.req.raw));
  return app;
};

// The nonce in the header, and the opening tags of the inline scripts in the page.
async function inlineScripts(res) {
  const nonce = /script-src [^;]*'nonce-([^']+)'/.exec(
    res.headers.get('content-security-policy'),
  )?.[1];
  const html = await res.text();
  const tags = html.match(/<script\b[^>]*>/g) ?? [];
  return { nonce, tags, html };
}

describe('inline scripts carry the CSP nonce', () => {
  it('GET /api/auth/mobile-start', async () => {
    const res = await serve(mobileStart).request('/api/auth/mobile-start?provider=google');
    const { nonce, tags } = await inlineScripts(res);
    expect(nonce).toBeTruthy();
    expect(tags).toEqual([`<script nonce="${nonce}">`]);
  });

  it('GET /api/auth/expo-web-success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await serve(expoWebSuccess).request('/api/auth/expo-web-success');
    const { nonce, tags } = await inlineScripts(res);
    expect(nonce).toBeTruthy();
    expect(tags).toEqual([`<script nonce="${nonce}">`]);
  });

  it('server render: hydration, scroll restore, streamed data and Suspense scripts', async () => {
    let ready = false;
    const pending = new Promise((resolve) =>
      setTimeout(() => {
        ready = true;
        resolve();
      }, 20),
    );
    const Late = () => {
      if (!ready) throw pending;
      return <p>late content</p>;
    };
    // The same two nonce props root.tsx passes.
    const Layout = ({ children }) => {
      const nonce = useContext(NonceContext);
      return (
        <html lang="en">
          <body>
            {children}
            <Suspense fallback={<p>waiting</p>}>
              <Late />
            </Suspense>
            <ScrollRestoration nonce={nonce} />
            <Scripts nonce={nonce} />
          </body>
        </html>
      );
    };
    const routes = [{ id: 'root', path: '/', Component: Outlet }];
    const staticHandlerContext = await createStaticHandler(routes).query(
      new Request('http://localhost/'),
    );
    const routerContext = () => ({
      manifest: {
        entry: { module: '/assets/entry.client.js', imports: [] },
        routes: { root: { id: 'root', path: '/', module: '/assets/root.js', imports: [] } },
        url: '/assets/manifest.js',
        version: '1',
      },
      routeModules: { root: { default: () => <main>page</main>, Layout } },
      staticHandlerContext,
      future: {},
      ssr: true,
      isSpaMode: false,
      routeDiscovery: { mode: 'initial' },
      serverHandoffString: '{}',
      serverHandoffStream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data'));
          controller.close();
        },
      }),
      renderMeta: {},
      serializeError: (e) => e,
    });

    const res = await serve((request) =>
      handleRequest(request, 200, new Headers(), routerContext(), {}),
    ).request('/');
    const { nonce, tags, html } = await inlineScripts(res);

    expect(nonce).toBeTruthy();
    expect(html).toContain('streamController.enqueue');
    expect(html).toContain('late content');
    expect(html).toContain('$RC');
    // scroll restore, context, route modules, two stream scripts, React's reveal script
    expect(tags.length).toBeGreaterThanOrEqual(6);
    for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);
  });

  it('root.tsx passes the nonce to every router script component', () => {
    const root = readFileSync(path.join(__dirname, 'root.tsx'), 'utf8');
    expect(root).toContain('<ScrollRestoration nonce={nonce} />');
    expect(root).toContain('<Scripts nonce={nonce} />');
    expect(root).toContain('useContext(NonceContext)');
  });

  // A new hand-written inline script in a route would be blocked in the browser, which no other
  // unit test would notice.
  it('no API route writes a <script> tag without the nonce', () => {
    const apiDir = path.join(__dirname, 'api');
    const offenders = readdirSync(apiDir, { recursive: true })
      .filter((file) => path.basename(file) === 'route.js')
      .flatMap((file) =>
        readFileSync(path.join(apiDir, file), 'utf8')
          .split('\n')
          .filter((line) => !line.trim().startsWith('//'))
          .filter((line) => /<script[\s>$]/.test(line) && !line.includes('${nonceAttr}'))
          .map((line) => `${file}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
