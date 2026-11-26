import { describe, expect, it } from 'vitest';
import { resolveSessionCookieSameSite as resolve } from './sessionCookie';

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
