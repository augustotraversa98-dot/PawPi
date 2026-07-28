import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for the "auth detour" (PR #21). The unit under test is the
// secureCookie line in ./create:
//
//   secureCookie: process.env.AUTH_URL?.startsWith('https') ?? false
//
// The PRE-#21 line was `process.env.AUTH_URL.startsWith('https')` (no `?.`,
// no `?? false`). In the Option B dev state, AUTH_URL is UNSET, so that bare
// `.startsWith` threw `TypeError: undefined is not an object` INSIDE auth(),
// before the session guard ran. Every app API route calls auth() in a
// try/catch, so the throw escaped to the catch and returned 500 — even for
// anonymous requests. No test ever hit an authenticated route, so the 500
// only surfaced on the physical phone.
//
// This file is the ONLY place that proves auth() tolerates an unset AUTH_URL
// (does not throw). Reverting ./create line 10 to the bare `.startsWith` form
// turns the first test red. The route smokes (pets/user-profile *.test.js)
// pin the resulting 401 contract with @/auth mocked; the throw->500
// end-to-end through the live stack stays deferred to Phase C.

import { getToken } from '@auth/core/jwt';
import { getContext } from 'hono/context-storage';
import CreateAuth from './create';

vi.mock('@auth/core/jwt', () => ({ getToken: vi.fn() }));
vi.mock('hono/context-storage', () => ({ getContext: vi.fn() }));

// The shared session-token contract. token.sub becomes session.user.id — the
// exact field every route guards on (`if (!session?.user?.id)`). Identity
// chain realism: this sub is auth_users.id (an integer), NOT user_profiles.id.
const TOKEN = {
  sub: 42,
  email: 'owner@example.com',
  name: 'Pat Owner',
  picture: null,
  exp: 9999999999,
};

const { auth } = CreateAuth();

let savedAuthUrl;

beforeEach(() => {
  vi.clearAllMocks();
  // Build a fake hono context so getContext() doesn't throw outside a request.
  // header() models a request with no x-forwarded-proto (e.g. a direct/local
  // request, no TLS-terminating proxy in front) — tests that care about the
  // Railway-forwarded-https case override this via mockReturnValueOnce.
  getContext.mockReturnValue({
    req: { raw: new Request('http://localhost/api/pets'), header: vi.fn(() => undefined) },
  });
  // Snapshot and clear AUTH_URL — its handling is the unit under test, not a
  // value to hardcode. Tests that need a value set it explicitly.
  savedAuthUrl = process.env.AUTH_URL;
  delete process.env.AUTH_URL;
});

afterEach(() => {
  if (savedAuthUrl === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = savedAuthUrl;
});

describe('auth() tolerates an unset AUTH_URL (the PR #21 fix)', () => {
  it('does NOT throw when AUTH_URL is undefined — it resolves to a mapped session', async () => {
    // The literal bug: pre-#21 this rejected with a TypeError instead of resolving.
    getToken.mockResolvedValue(TOKEN);

    const session = await auth();

    // Asserted on session.user.id specifically — the field the route guard reads.
    expect(session.user.id).toBe(TOKEN.sub);
    expect(session.user.email).toBe(TOKEN.email);
    expect(session.user.name).toBe(TOKEN.name);
    expect(session.expires).toBe(String(TOKEN.exp));
  });

  it('passes secureCookie:false to getToken when AUTH_URL is unset', async () => {
    getToken.mockResolvedValue(TOKEN);
    await auth();
    expect(getToken).toHaveBeenCalledWith(
      expect.objectContaining({ secureCookie: false }),
    );
  });

  it('passes secureCookie:false for an http AUTH_URL (dev)', async () => {
    process.env.AUTH_URL = 'http://localhost:4000';
    getToken.mockResolvedValue(TOKEN);
    await auth();
    expect(getToken).toHaveBeenCalledWith(
      expect.objectContaining({ secureCookie: false }),
    );
  });

  it('passes secureCookie:true for an https AUTH_URL (prod)', async () => {
    process.env.AUTH_URL = 'https://app.pawpi.example';
    getToken.mockResolvedValue(TOKEN);
    await auth();
    expect(getToken).toHaveBeenCalledWith(
      expect.objectContaining({ secureCookie: true }),
    );
  });

  it('passes secureCookie:true when x-forwarded-proto is https (Railway\'s TLS-terminating edge, AUTH_URL unset)', async () => {
    // The real fix this file was missing: off-platform, AUTH_URL stays unset
    // even on the genuinely-https Railway deploy (see __create/index.ts cookies
    // comment) — the TLS-terminating proxy's forwarded-proto header is what
    // actually distinguishes it from a plain local http request.
    getContext.mockReturnValue({
      req: {
        raw: new Request('http://localhost/api/pets'),
        header: vi.fn((name) => (name === 'x-forwarded-proto' ? 'https' : undefined)),
      },
    });
    getToken.mockResolvedValue(TOKEN);
    await auth();
    expect(getToken).toHaveBeenCalledWith(
      expect.objectContaining({ secureCookie: true }),
    );
  });

  it('returns undefined when there is no token (the anonymous path routes rely on)', async () => {
    getToken.mockResolvedValue(undefined);
    expect(await auth()).toBeUndefined();
  });
});

describe('demonstrates the bug: the contrast between the two expressions', () => {
  // Shown inline (mirroring jsonb.test.js) so the regression is explicit.
  it('the bare .startsWith throws on undefined; the guarded form yields false', () => {
    const url = undefined;
    expect(() => url.startsWith('https')).toThrow(TypeError); // ← the PRE-#21 line
    expect(url?.startsWith('https') ?? false).toBe(false); //   ← the current guard
  });
});
