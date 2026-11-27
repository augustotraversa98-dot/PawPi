import { describe, expect, it } from 'vitest';
import { expiredSessionCookies, resolveSessionCookieSameSite as resolve } from './sessionCookie';

describe('expiredSessionCookies', () => {
  it('expires the session cookie under both names, including the parts of a large one', () => {
    const header = '__Secure-authjs.session-token.0=a; __Secure-authjs.session-token.1=b; authjs.session-token=c';
    expect(expiredSessionCookies(header)).toEqual([
      '__Secure-authjs.session-token.0=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
      '__Secure-authjs.session-token.1=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
      'authjs.session-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    ]);
  });
  it('leaves every other cookie alone', () => {
    const header = '__Host-authjs.csrf-token=a; __Secure-authjs.callback-url=b; pawpi_mobile_nonce=c; xauthjs.session-token=d';
    expect(expiredSessionCookies(header)).toEqual([]);
    expect(expiredSessionCookies(null)).toEqual([]);
  });
});

describe('resolveSessionCookieSameSite', () => {
  it('keeps SameSite=None on https unless the flag is set to lax', () => {
    expect(resolve({ useSecure: true, env: {} })).toBe('none');
    expect(resolve({ useSecure: true, env: { AUTH_COOKIE_SAMESITE: '' } })).toBe('none');
    expect(resolve({ useSecure: true, env: { AUTH_COOKIE_SAMESITE: 'none' } })).toBe('none');
    expect(resolve({ useSecure: true, env: { AUTH_COOKIE_SAMESITE: 'strict' } })).toBe('none'); // only the tested value turns it on
    expect(resolve({ useSecure: true, env: { AUTH_COOKIE_SAMESITE: '1' } })).toBe('none');
  });
  it('uses Lax on https when the flag is lax (any case, surrounding space)', () => {
    expect(resolve({ useSecure: true, env: { AUTH_COOKIE_SAMESITE: 'lax' } })).toBe('lax');
    expect(resolve({ useSecure: true, env: { AUTH_COOKIE_SAMESITE: ' LAX ' } })).toBe('lax');
  });
  it('is always Lax on plain http, as before', () => {
    expect(resolve({ useSecure: false, env: {} })).toBe('lax');
    expect(resolve({ useSecure: false, env: { AUTH_COOKIE_SAMESITE: 'lax' } })).toBe('lax');
  });
});
