import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders, CSP_DIRECTIVES, PERMISSIONS_POLICY } from './securityHeaders';

describe('securityHeaders (AUDIT A-28)', () => {
  const app = new Hono();
  app.use('*', securityHeaders());
  app.get('/', (c) => c.text('ok'));

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
  });

  it('CSP allows inline/eval scripts so SSR hydration + the auth WebView keep working', () => {
    expect(CSP_DIRECTIVES.scriptSrc).toContain("'unsafe-inline'");
    expect(CSP_DIRECTIVES.scriptSrc).toContain("'unsafe-eval'");
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
    const res = await app.request('/');
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|fontawesome/);
    expect(CSP_DIRECTIVES.fontSrc).toEqual(["'self'", 'data:']);
    expect(CSP_DIRECTIVES.styleSrc).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe('Permissions-Policy', () => {
  const app = new Hono();
  app.use('*', securityHeaders());
  app.get('/', (c) => c.text('ok'));

  const parse = (header) =>
    Object.fromEntries(
      header.split(', ').map((part) => {
        const [name, value] = part.split('=');
        return [name, value];
      }),
    );

  it('is sent on every response', async () => {
    const res = await app.request('/');
    expect(res.headers.get('permissions-policy')).toBeTruthy();
  });

  it('allows only clipboard-write and fullscreen, same-origin only', async () => {
    const policy = parse((await app.request('/')).headers.get('permissions-policy'));
    const allowed = Object.entries(policy)
      .filter(([, v]) => v !== '()')
      .sort();
    expect(allowed).toEqual([
      ['clipboard-write', '(self)'],
      ['fullscreen', '(self)'],
    ]);
  });

  it('denies the sensitive features outright', async () => {
    const policy = parse((await app.request('/')).headers.get('permissions-policy'));
    for (const f of [
      'camera',
      'microphone',
      'geolocation',
      'payment',
      'display-capture',
      'clipboard-read',
      'usb',
      'serial',
      'hid',
      'publickey-credentials-get',
      'browsing-topics',
    ]) {
      expect(policy[f], f).toBe('()');
    }
  });

  it('never opens a feature to every origin or to a third party', () => {
    for (const [feature, list] of Object.entries(PERMISSIONS_POLICY)) {
      for (const item of list) expect(item, feature).toBe('self');
    }
  });
});
