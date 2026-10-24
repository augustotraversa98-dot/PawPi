/**
 * Regression guard for the login bounce-back bug.
 *
 * The global fetch wrapper attaches the bearer token by reading it back out of
 * the Keychain. It used to read without the pinned `secureStoreOptions`, which
 * expo-secure-store resolves to a *different* `kSecAttrService` than the one the
 * auth store writes under — so the read returned null, every first-party request
 * went out unauthenticated, and the EntryPoint gate mistook the resulting 401
 * for an expired session and sent the user back to Welcome right after login.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
}));

jest.mock('expo/fetch', () => ({ fetch: jest.fn(async () => ({ ok: true })) }));

import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import fetchToWeb from './fetch';
import { authKey, secureStoreOptions } from '@/utils/auth/secureStore';
import { resetCachedAuthForTests, setCachedAuth } from '@/utils/auth/tokenCache';
import { closeLaunchGate, __resetLaunchGateForTests } from '@/utils/auth/sessionLaunchGate';
import { __resetSessionHealthForTests, RECHECK_ALIVE_COOLDOWN_MS } from '@/utils/auth/sessionHealth';

const BASE_URL = 'https://pawpi-production.up.railway.app';

beforeEach(() => {
  jest.clearAllMocks();
  resetCachedAuthForTests();
  process.env.EXPO_PUBLIC_BASE_URL = BASE_URL;
  SecureStore.getItemAsync.mockResolvedValue(
    JSON.stringify({ jwt: 'test-jwt', user: { id: 'u1' } }),
  );
});

test('reads the token with the same Keychain options the auth store writes with', async () => {
  await fetchToWeb('/api/pets');

  expect(SecureStore.getItemAsync).toHaveBeenCalledWith(authKey, secureStoreOptions);
  expect(secureStoreOptions.keychainService).toBe('anything-auth');
});

test('attaches the bearer token to first-party requests', async () => {
  await fetchToWeb('/api/pets');

  const [url, init] = expoFetch.mock.calls[0];
  expect(url).toBe(`${BASE_URL}/api/pets`);
  expect(init.headers.get('authorization')).toBe('Bearer test-jwt');
});

test('sends no Authorization header when nothing is stored', async () => {
  SecureStore.getItemAsync.mockResolvedValue(null);

  await fetchToWeb('/api/pets');

  const [, init] = expoFetch.mock.calls[0];
  expect(init.headers.get('authorization')).toBeNull();
});

test('does not leak the token to third-party hosts', async () => {
  await fetchToWeb('https://example.com/thing');

  const [, init] = expoFetch.mock.calls[0];
  expect(init?.headers?.get?.('authorization') ?? null).toBeNull();
});

// Misrouted-API guard: a backend missing an /api route serves the SPA app-shell (200 text/html).
// Without the guard, callers' `await res.json()` throws a cryptic SyntaxError. The guard turns
// that into a clear error, while leaving JSON / non-OK / other content-types untouched.
const resp = ({ ok, status, contentType, json }) => ({
  ok,
  status,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
  json,
});

test('an OK /api response with an HTML body throws a CLEAR error (not a JSON SyntaxError)', async () => {
  expoFetch.mockResolvedValueOnce(
    resp({ ok: true, status: 200, contentType: 'text/html; charset=utf-8' }),
  );

  const err = await fetchToWeb('/api/me/bookings/xyz').catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toMatch(/HTML response from API route "\/api\/me\/bookings\/xyz"/i);
  // It must NOT be the old cryptic JSON parse failure.
  expect(err.message).not.toMatch(/JSON|Unexpected token/i);
});

test('a normal 200 JSON /api response is returned unchanged (no throw)', async () => {
  const payload = { hello: 'world' };
  expoFetch.mockResolvedValueOnce(
    resp({ ok: true, status: 200, contentType: 'application/json', json: async () => payload }),
  );

  const res = await fetchToWeb('/api/pets');
  expect(res.ok).toBe(true);
  expect(await res.json()).toEqual(payload);
});

test('a non-OK response is passed through unchanged, even with an HTML body (existing error path)', async () => {
  expoFetch.mockResolvedValueOnce(
    resp({ ok: false, status: 401, contentType: 'text/html' }),
  );

  const res = await fetchToWeb('/api/pets'); // does NOT throw
  expect(res.ok).toBe(false);
  expect(res.status).toBe(401);
});

test('an intentionally non-JSON /api endpoint (text/calendar) is NOT treated as an error', async () => {
  expoFetch.mockResolvedValueOnce(
    resp({ ok: true, status: 200, contentType: 'text/calendar; charset=utf-8' }),
  );

  const res = await fetchToWeb('/api/calendar/booking-123.ics');
  expect(res.ok).toBe(true); // passed through, no throw
});

// Fail-closed deadline (AUDIT_2026-09 A-02): a first-party request that never settles must
// reject after FIRST_PARTY_TIMEOUT_MS instead of hanging React-Query in `isFetching` forever.
describe('first-party request deadline', () => {
  const { FIRST_PARTY_TIMEOUT_MS } = jest.requireActual('./fetch');

  afterEach(() => {
    jest.useRealTimers();
  });

  test('attaches an abort signal to first-party requests when the caller gives none', async () => {
    await fetchToWeb('/api/pets');

    const [, init] = expoFetch.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });

  test('respects a caller-supplied signal instead of adding its own', async () => {
    const controller = new AbortController();

    await fetchToWeb('/api/pets', { signal: controller.signal });

    const [, init] = expoFetch.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  test('a caller-supplied signal gets no 15 s cut-off on top (uploads bring their own, longer deadline)', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();

    await fetchToWeb('/api/upload', { method: 'POST', signal: controller.signal });
    await jest.advanceTimersByTimeAsync(FIRST_PARTY_TIMEOUT_MS * 2);

    expect(jest.getTimerCount()).toBe(0);
    expect(controller.signal.aborted).toBe(false);
  });

  test('rejects after the deadline when the request never settles', async () => {
    jest.useFakeTimers();
    expoFetch.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );

    const pending = fetchToWeb('/api/pets');
    // Attach the rejection expectation BEFORE the clock moves so the abort is never an
    // unhandled rejection.
    const rejects = expect(pending).rejects.toThrow('Aborted');
    // Let the async SecureStore read settle so the fetch (and its timer) is actually started.
    await jest.advanceTimersByTimeAsync(0);
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(FIRST_PARTY_TIMEOUT_MS);

    await rejects;
    expect(jest.getTimerCount()).toBe(0);
  });

  test('clears the deadline as soon as the response arrives (slow bodies are not cut off)', async () => {
    jest.useFakeTimers();

    await fetchToWeb('/api/pets');

    expect(jest.getTimerCount()).toBe(0);
  });

  test('does not add a deadline to third-party requests', async () => {
    await fetchToWeb('https://example.com/thing');

    const [, init] = expoFetch.mock.calls[0];
    expect(init?.signal ?? null).toBeNull();
  });
});

// Expired session (AUDIT_2026-09 A-07, refined). A 401 on an /api route while a bearer was attached is
// a DEAD session only when it carries the server's `session_expired` code, or when ONE re-check against
// GET /api/session confirms it. A bare 401 / a business error / a network error never signs the user out.
describe('expired-session handling', () => {
  const mockSetAuth = jest.fn();
  const mockReplace = jest.fn();
  const mockTrack = jest.fn();
  let storedAuth;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.requireActual('./fetch').__resetSessionExpiryForTests();
    __resetSessionHealthForTests();
    __resetLaunchGateForTests();
    closeLaunchGate(); // past the cold-launch window (the EntryPoint owns that: see index.launch.test)
    mockSetAuth.mockClear();
    mockReplace.mockClear();
    mockTrack.mockClear();
    storedAuth = { jwt: 'test-jwt', user: { id: 'u1' } };
    jest.doMock('@/utils/auth/store', () => ({
      useAuthStore: {
        getState: () => ({
          auth: storedAuth,
          setAuth: (v) => {
            storedAuth = v;
            mockSetAuth(v);
          },
        }),
      },
    }));
    jest.doMock('expo-router', () => ({ router: { replace: mockReplace } }));
    jest.doMock('@/telemetry/track', () => ({ track: (...a) => mockTrack(...a) }));
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.dontMock('@/utils/auth/store');
    jest.dontMock('expo-router');
    jest.dontMock('@/telemetry/track');
  });

  // A real dead session: the server stamps its 401 (header + body) with the code.
  const sessionExpired = () => ({
    ok: false,
    status: 401,
    headers: { get: (h) => (h.toLowerCase() === 'x-pawpi-error-code' ? 'session_expired' : 'application/json') },
    clone() {
      return this;
    },
    json: async () => ({ error: 'Unauthorized', code: 'session_expired' }),
  });
  // A bare 401: no code anywhere (an old server, a proxy, or something that is not a session problem).
  const bare401 = () => ({
    ...resp({ ok: false, status: 401, contentType: 'application/json' }),
    clone() {
      return this;
    },
    json: async () => ({ error: 'Unauthorized' }),
  });
  // Route the first-party request vs the single /api/session re-check.
  const serve = ({ main, recheck }) =>
    expoFetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/api/session')) {
        if (recheck instanceof Error) throw recheck;
        return recheck;
      }
      return main;
    });
  const recheckCalls = () => expoFetch.mock.calls.filter(([u]) => String(u).endsWith('/api/session'));
  const flush = () => jest.advanceTimersByTimeAsync(0);
  const diag = () => mockTrack.mock.calls.filter(([n]) => n === 'auth_diag').map(([, p]) => p.kind);

  test('a 401 carrying session_expired signs out and goes to Welcome (no re-check needed)', async () => {
    serve({ main: sessionExpired() });

    const res = await fetchToWeb('/api/pets');
    await flush();

    expect(res.status).toBe(401);
    expect(mockSetAuth).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
    expect(recheckCalls()).toHaveLength(0);
    expect(diag()).toEqual(['session_cleared_code']);
  });

  test('a business 403 (what a bad pickup code now returns) does NOT sign out', async () => {
    serve({ main: resp({ ok: false, status: 403, contentType: 'application/json' }) });

    const res = await fetchToWeb('/api/providers/1/walk-pickup/redeem', { method: 'POST' });
    await flush();

    expect(res.status).toBe(403);
    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(recheckCalls()).toHaveLength(0);
  });

  test('a bare 401 is re-checked once; a 401 from the session endpoint confirms it is dead', async () => {
    serve({ main: bare401(), recheck: resp({ ok: false, status: 401, contentType: 'application/json' }) });

    await fetchToWeb('/api/pets');
    await flush();

    expect(recheckCalls()).toHaveLength(1);
    expect(recheckCalls()[0][1].headers.authorization).toBe('Bearer test-jwt');
    expect(mockSetAuth).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
    expect(diag()).toEqual(['session_cleared_recheck']);
  });

  test('a bare 401 whose re-check says the session is fine does NOT sign out (and is reported)', async () => {
    serve({ main: bare401(), recheck: resp({ ok: true, status: 200, contentType: 'application/json' }) });

    await fetchToWeb('/api/pets');
    await flush();

    expect(recheckCalls()).toHaveLength(1);
    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(diag()).toEqual(['recheck_alive']);
  });

  test.each([
    ['a network error', new Error('Network request failed')],
    ['a 500', resp({ ok: false, status: 500, contentType: 'application/json' })],
    ['a 404 (older server without /api/session)', resp({ ok: false, status: 404, contentType: 'application/json' })],
  ])('a bare 401 whose re-check fails with %s does NOT sign out', async (_name, recheck) => {
    serve({ main: bare401(), recheck });

    await fetchToWeb('/api/pets');
    await flush();

    expect(recheckCalls()).toHaveLength(1);
    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('a burst of bare 401s shares ONE re-check; a burst of coded 401s signs out only once', async () => {
    serve({ main: bare401(), recheck: resp({ ok: true, status: 200, contentType: 'application/json' }) });
    await Promise.all([fetchToWeb('/api/pets'), fetchToWeb('/api/posts'), fetchToWeb('/api/routines')]);
    await flush();
    expect(recheckCalls()).toHaveLength(1);
    expect(mockSetAuth).not.toHaveBeenCalled();

    // …and a recent "alive" answer is reused instead of re-checking again right away.
    await fetchToWeb('/api/pets');
    await flush();
    expect(recheckCalls()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(RECHECK_ALIVE_COOLDOWN_MS + 1);

    serve({ main: sessionExpired() });
    await Promise.all([fetchToWeb('/api/pets'), fetchToWeb('/api/posts'), fetchToWeb('/api/routines')]);
    await flush();
    expect(mockSetAuth).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test('a late 401 for an OLD token never signs out the session that replaced it', async () => {
    serve({ main: sessionExpired() });
    const pending = fetchToWeb('/api/pets'); // sent with 'test-jwt'
    storedAuth = { jwt: 'other-jwt', user: { id: 'u2' } }; // the user signs in as someone else meanwhile
    await pending;
    await flush();

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(storedAuth.jwt).toBe('other-jwt');
  });

  test('while the launch gate is open the EntryPoint owns the decision: the wrapper does nothing', async () => {
    __resetLaunchGateForTests(); // open again
    serve({ main: sessionExpired() });

    await fetchToWeb('/api/pets');
    await flush();

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(recheckCalls()).toHaveLength(0);
  });

  test('401 without a stored token is left to the caller', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    serve({ main: sessionExpired() });

    await fetchToWeb('/api/pets');
    await flush();

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('401 from the auth bridge never counts as an expired session', async () => {
    serve({ main: sessionExpired() });

    await fetchToWeb('/api/auth/token');
    await flush();

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('a non-401 failure does not sign out', async () => {
    serve({ main: resp({ ok: false, status: 500, contentType: 'application/json' }) });

    await fetchToWeb('/api/pets');
    await flush();

    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  test('a network error on a first-party request never signs out (the request just rejects)', async () => {
    expoFetch.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(fetchToWeb('/api/pets')).rejects.toThrow('Network request failed');
    await flush();

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(recheckCalls()).toHaveLength(0);
  });
});

// Perf audit 2026-10-23 (F1.6): the Keychain used to be read + parsed before EVERY request.
describe('in-memory session cache', () => {
  test('reads the Keychain once, then serves the token from memory', async () => {
    await fetchToWeb('/api/pets');
    await fetchToWeb('/api/posts');
    await fetchToWeb('/api/notifications');

    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
    for (const [, init] of expoFetch.mock.calls) {
      expect(init.headers.get('authorization')).toBe('Bearer test-jwt');
    }
  });

  test('a signed-in session set through the auth store wins over the Keychain, with no read', async () => {
    setCachedAuth({ jwt: 'fresh-jwt', user: { id: 'u2' } });
    await fetchToWeb('/api/pets');

    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(expoFetch.mock.calls[0][1].headers.get('authorization')).toBe('Bearer fresh-jwt');
  });

  test('after logout (cache = null) no stale token is sent and the Keychain is not consulted', async () => {
    await fetchToWeb('/api/pets'); // primes the cache with test-jwt
    setCachedAuth(null); // what setAuth(null) does
    SecureStore.getItemAsync.mockClear();
    expoFetch.mockClear();

    await fetchToWeb('/api/pets');

    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(expoFetch.mock.calls[0][1].headers.get('authorization')).toBeNull();
  });

  test('an empty or failed Keychain read is not cached: it is retried on the next request', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    await fetchToWeb('/api/pets');
    expect(expoFetch.mock.calls[0][1].headers.get('authorization')).toBeNull();

    await fetchToWeb('/api/pets'); // default mock now resolves to the stored session
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
    expect(expoFetch.mock.calls[1][1].headers.get('authorization')).toBe('Bearer test-jwt');
  });
});
