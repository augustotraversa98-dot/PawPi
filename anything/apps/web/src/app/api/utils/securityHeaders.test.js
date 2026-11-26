// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { securityHeaders, cspDirectives, cspNonce, CSP_DIRECTIVES } from './securityHeaders';

// Same order as __create/index.ts: contextStorage() first, so cspNonce() can read the request.
function makeApp(options) {
  const app = new Hono();
  app.use(contextStorage());
  app.use('*', securityHeaders(options));
  app.get('/', (c) => c.text('ok'));
  app.get('/nonce', async (c) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return c.json({ nonce: cspNonce() ?? null });
  });
  return app;
}

const directive = (csp, name) =>
  csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

const nonceOf = (csp) => /'nonce-([^']+)'/.exec(csp)?.[1];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('securityHeaders (AUDIT A-28)', () => {
  const app = makeApp();

  it('sets HSTS, frame, nosniff, referrer and CSP headers', async () => {
    const res = await app.request('/');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers.has('content-security-policy-report-only')).toBe(false);
  });

  it("script-src is this site plus a nonce: no 'unsafe-inline', no 'unsafe-eval'", async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', '');
    const res = await makeApp().request('/');
    const csp = res.headers.get('content-security-policy');
    expect(directive(csp, 'script-src')).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/]{22}=='$/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain('wasm-unsafe-eval');
  });

  it('every request gets its own nonce, and cspNonce() returns the one in the header', async () => {
    const [first, second] = await Promise.all([app.request('/nonce'), app.request('/nonce')]);
    const seen = [];
    for (const res of [first, second]) {
      const nonce = nonceOf(res.headers.get('content-security-policy'));
      expect(nonce).toBeTruthy();
      expect((await res.json()).nonce).toBe(nonce);
      seen.push(nonce);
    }
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('cspNonce() is undefined outside a request', () => {
    expect(cspNonce()).toBeUndefined();
  });

  it('dev (Vite) keeps inline and eval, and sends no nonce that would disable them', async () => {
    const res = await makeApp({ dev: true }).request('/nonce');
    const csp = res.headers.get('content-security-policy');
    expect(directive(csp, 'script-src')).toContain("'unsafe-inline' 'unsafe-eval'");
    expect(nonceOf(csp)).toBeUndefined();
    expect((await res.json()).nonce).toBeNull();
  });

  // Regression: WebKit enforces form-action across redirects. /api/auth/mobile-start
  // form-POSTs to /api/auth/signin/google, which 302s to Google's authorize endpoint.
  // Drop this origin and iOS sign-in hangs on "Signing in…" with no server-side error.
  it('CSP form-action allows the Google OAuth authorize endpoint (iOS sign-in)', async () => {
    expect(CSP_DIRECTIVES.formAction).toContain('https://accounts.google.com');
    const res = await app.request('/');
    expect(res.headers.get('content-security-policy')).toContain(
      "form-action 'self' https://accounts.google.com",
    );
  });

  // Public pages self-host Nunito / JetBrains Mono (public/fonts) and ship no Font Awesome kit, so the
  // CSP must not re-open a third-party font origin (a visitor's IP would reach Google / Font Awesome).
  it('CSP allows no third-party font or stylesheet origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', '');
    const res = await makeApp().request('/');
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|fontawesome|maps\./);
    expect(CSP_DIRECTIVES.fontSrc).toEqual(["'self'", 'data:']);
    expect(CSP_DIRECTIVES.styleSrc).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe('securityHeaders with the Google Maps picker', () => {
  it('a configured browser key allows the Maps hosts, still without inline or eval', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', 'test-browser-key');
    const csp = (await makeApp().request('/')).headers.get('content-security-policy');
    const script = directive(csp, 'script-src');
    expect(script).toContain('https://maps.googleapis.com');
    expect(script).toContain('https://maps.gstatic.com');
    expect(script).toMatch(/'nonce-[^']+'/);
    expect(script).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(directive(csp, 'worker-src')).toBe("worker-src 'self' blob:");
  });

  it('does not change the shared base directives', () => {
    const before = structuredClone({ ...CSP_DIRECTIVES, scriptSrc: CSP_DIRECTIVES.scriptSrc.length });
    cspDirectives({ dev: true, maps: true });
    expect({ ...CSP_DIRECTIVES, scriptSrc: CSP_DIRECTIVES.scriptSrc.length }).toEqual(before);
  });
});
