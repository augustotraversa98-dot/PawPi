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

const BASE_URL = 'https://pawpi-production.up.railway.app';

beforeEach(() => {
  jest.clearAllMocks();
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

// Expired session (AUDIT_2026-09 A-07): a 401 on an /api route while a bearer was attached
// must drop the session and route to Welcome — once — and never fire for the auth bridge or
// for requests that carried no token.
describe('expired-session handling', () => {
  const mockSetAuth = jest.fn();
  const mockReplace = jest.fn();
  let storedAuth;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.requireActual('./fetch').__resetSessionExpiryForTests();
    mockSetAuth.mockClear();
    mockReplace.mockClear();
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
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.dontMock('@/utils/auth/store');
    jest.dontMock('expo-router');
  });

  const unauthorized = () => resp({ ok: false, status: 401, contentType: 'application/json' });

  test('401 with a bearer on an /api route signs out and goes to Welcome', async () => {
    expoFetch.mockResolvedValueOnce(unauthorized());

    const res = await fetchToWeb('/api/pets');

    expect(res.status).toBe(401);
    expect(mockSetAuth).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });

  test('a burst of 401s signs out only once', async () => {
    expoFetch.mockResolvedValue(unauthorized());

    await Promise.all([fetchToWeb('/api/pets'), fetchToWeb('/api/posts'), fetchToWeb('/api/routines')]);

    expect(mockSetAuth).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test('401 without a stored token is left to the caller', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    expoFetch.mockResolvedValueOnce(unauthorized());

    await fetchToWeb('/api/pets');

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('401 from the auth bridge never counts as an expired session', async () => {
    expoFetch.mockResolvedValueOnce(unauthorized());

    await fetchToWeb('/api/auth/token');

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('a non-401 failure does not sign out', async () => {
    expoFetch.mockResolvedValueOnce(resp({ ok: false, status: 500, contentType: 'application/json' }));

    await fetchToWeb('/api/pets');

    expect(mockSetAuth).not.toHaveBeenCalled();
  });
});
