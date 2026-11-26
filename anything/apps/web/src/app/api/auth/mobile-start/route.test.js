// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from './route';

const BASE = 'https://www.example.test';
const start = (qs = 'provider=google', headers = {}) => GET(new Request(`${BASE}/api/auth/mobile-start?${qs}`, { headers }));
const nonceOf = (res) => res.headers.get('set-cookie').match(/pawpi_mobile_nonce=([0-9a-f]+);/)[1];

describe('GET /api/auth/mobile-start', () => {
  it('sets a one-time nonce as an HttpOnly, Lax, short-lived cookie scoped to /api/auth', async () => {
    const res = await start('provider=google', { 'x-forwarded-proto': 'https' });
    expect(res.status).toBe(200);
    const c = res.headers.get('set-cookie');
    expect(nonceOf(res)).toHaveLength(32);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Path=\/api\/auth(;|$)/);
    expect(c).toMatch(/Max-Age=600/);
    expect(c).toMatch(/Secure/);
  });

  it('omits Secure on plain http (local dev) so the cookie is still stored', async () => {
    const res = await GET(new Request('http://localhost:4000/api/auth/mobile-start?provider=google'));
    expect(res.headers.get('set-cookie')).not.toMatch(/Secure/);
  });

  it('puts the same nonce in the callbackUrl handed to Auth.js, and a fresh one each time', async () => {
    const a = await start();
    const b = await start();
    const html = await a.text();
    expect(html).toContain(`&n=${nonceOf(a)}`);
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });

  it('keeps the existing behaviour: only google, return target limited to the app scheme, no store', async () => {
    expect((await start('provider=apple')).status).toBe(400);
    const res = await start('provider=google&return=https://evil.test');
    expect(await res.text()).toContain(encodeURIComponent('pawpi://auth-callback'));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
