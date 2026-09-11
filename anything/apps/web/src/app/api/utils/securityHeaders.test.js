import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders, CSP_DIRECTIVES } from './securityHeaders';

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
});
